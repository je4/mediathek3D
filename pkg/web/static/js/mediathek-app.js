/**
 * MediathekApp - Interactive UI Controller & Application Orchestrator.
 *
 * Coordinates 3D scene rendering, user input, raycasting, search with autocomplete,
 * URL hash routing, camera presets, box info inspection drawer, camera JSON serialization,
 * and high-resolution screenshot export.
 *
 * @module mediathek-app
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

import * as THREE from 'three';
import { Mediathek } from './mediathek-core.js';
import { Mediathek3D } from './mediathek-3d.js';
import { UIController } from './modules/ui-controller.js';
import { ThemeManager, DEFAULT_THEME } from './modules/theme-manager.js';

export class MediathekApp {
    /**
     * Initializes the complete Mediathek 3D web application.
     *
     * @param {Object} options Application configuration options.
     * @param {string} [options.containerSelector='#renderer-container'] Viewport container selector.
     * @param {string} [options.floorImage='static/img/mt_background.png'] Floor map image path.
     * @param {string} [options.boxData='api/boxes'] Shelf geometry JSON endpoint.
     * @param {string} [options.positionsData='static/data/kistenpositions.json'] Precomputed box positions endpoint.
     * @param {string} [options.initialBox=''] Initially highlighted box (from URL or Go template).
     * @param {Array<string>|string} [options.initialShelf=''] Initial shelf filter.
     * @param {string} [options.theme=''] Initial color theme (e.g. 'ocher', 'sage', 'olive', 'terracotta', 'classic').
     * @param {string} [options.camJSON=null] Initial camera JSON matrix string.
     * @param {boolean} [options.isEmbed=false] Embedded / minimal UI mode.
     */
    constructor(options = {}) {
        this.options = Object.assign({
            containerSelector: '#renderer-container',
            floorImage: 'static/img/mt_background.png',
            boxData: 'api/boxes',
            positionsData: 'static/data/kistenpositions.json',
            initialBox: '',
            initialShelf: '',
            theme: '',
            camJSON: null,
            isEmbed: false
        }, options);

        this.mediathek = null;
        this.mediathek3D = null;
        this.themeManager = null;
        this.selectedBoxId = null;
        this.hoveredBoxId = null;
        this.boxesCache = [];

        this._parseURLParams();
        this._initTheme();
        this._initUI();
        this._init3D();
        this._bindRaycastingEvents();
    }

    /**
     * Parses URL query parameters and location hash.
     * @private
     */
    _parseURLParams() {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('box')) {
            this.options.initialBox = urlParams.get('box');
        } else if (window.location.hash) {
            this.options.initialBox = window.location.hash.replace(/^#/, '');
        }

        if (urlParams.has('shelf')) {
            const shelfParam = urlParams.get('shelf');
            this.options.initialShelf = shelfParam.split(',').map(s => s.trim());
        }

        if (urlParams.has('theme')) {
            this.options.theme = urlParams.get('theme');
        }

        if (urlParams.has('cam')) {
            this.options.camJSON = urlParams.get('cam');
        }

        if (urlParams.has('mode') && urlParams.get('mode') === 'embed') {
            this.options.isEmbed = true;
        }
    }

    /**
     * Initializes the ThemeManager with URL parameter, saved localStorage preference, or default theme.
     * @private
     */
    _initTheme() {
        let initialTheme = this.options.theme;
        if (!initialTheme && typeof localStorage !== 'undefined') {
            try {
                initialTheme = localStorage.getItem('mediathek3d_theme') || DEFAULT_THEME;
            } catch (e) {
                initialTheme = DEFAULT_THEME;
            }
        }
        this.themeManager = new ThemeManager({
            initialTheme: initialTheme || DEFAULT_THEME
        });
        // Apply initial theme CSS
        this.themeManager.setTheme(this.themeManager.currentThemeId, false);
    }

    /**
     * Initializes the UIController and hooks up event delegates.
     * @private
     */
    _initUI() {
        this.ui = new UIController({
            container: this.options.containerSelector,
            onSearchInput: (query) => this._onSearchInput(query),
            onSearchSelect: (boxId) => this.selectBox(boxId),
            onShelfFilterChange: (shelfKey) => this._onShelfFilterChange(shelfKey),
            onApplyCamJSON: (camJsonStr) => this._onApplyCamJSON(camJsonStr),
            onResetView: () => this.resetCameraView(),
            onTopView: () => this.setTopCameraView(),
            onScreenshot: () => this.downloadScreenshot(),
            onThemeChange: (themeId) => this.themeManager.setTheme(themeId, true),
            onCycleTheme: () => this.themeManager.cycleTheme()
        });

        this.themeManager.attach({ ui: this.ui });
    }

    /**
     * Instantiates Mediathek core and Mediathek3D geometry graph.
     * @private
     */
    _init3D() {
        // Show loading overlay
        this.ui.showLoadingOverlay(true);

        const currentTheme = this.themeManager.getCurrentTheme();

        // 1. Initialize Mediathek Three.js Scene Engine
        this.mediathek = new Mediathek({
            renderDOM: this.options.containerSelector,
            backgroundColor: currentTheme.backgroundColor,
            camType: 'perspective',
            controlType: 'orbit',
            camJSON: this.options.camJSON,
            shadows: true,
            antialias: true
        });

        // 2. Initialize 3D Floor & Shelf Geometry Component
        const mediathek3DConfig = {
            floorImage: this.options.floorImage,
            boxData: this.options.boxData,
            positionsData: this.options.positionsData,
            pixelFactor: 4,
            boxColor: currentTheme.boxColor,
            bottomColor: currentTheme.bottomColor,
            boxColorHighlight: currentTheme.boxColorHighlight,
            drawOnly: this.options.initialShelf ? this.options.initialShelf : null,
            boxDelay: 0
        };

        this.mediathek3D = new Mediathek3D(mediathek3DConfig, (m3d) => {
            this._onSceneReady(m3d);
        });

        this.mediathek.scene.add(this.mediathek3D);

        // Position camera to default view if no camJSON provided
        if (!this.options.camJSON) {
            this.mediathek.camera.position.set(0, -3200, 3800);
            this.mediathek.camera.lookAt(0, 0, 0);
            if (this.mediathek.controls) {
                this.mediathek.controls.target.set(0, 0, 0);
                this.mediathek.controls.update();
            }
        }

        // Start render loop
        this.mediathek.startAnimation();

        // Update CamJSON textarea on camera change
        this.mediathek.addRenderCallback(() => {
            if (this.mediathek.controls && this.mediathek.controls.state !== -1) {
                this._syncCamJSON();
            }
        });
    }

    /**
     * Invoked when 3D geometry generation and asset loading complete.
     * @private
     */
    _onSceneReady(m3d) {
        this.ui.showLoadingOverlay(false);
        this.themeManager.attach({
            mediathek: this.mediathek,
            mediathek3D: this.mediathek3D,
            ui: this.ui
        });
        this.boxesCache = m3d.boxNames.map(name => {
            const meta = m3d.getBoxMetadata(name) || {};
            const baseName = meta.name || name.replace(/[ab]$/i, '');
            return {
                id: name,
                id2: meta.id2 || name,
                name: baseName,
                shelf: meta.shelf || name.charAt(0),
                level: meta.level || parseInt(baseName.charAt(1), 10) || 1,
                index: meta.index || parseInt(baseName.substring(2), 10) || 1,
                index2: meta.index2 || meta.index || 1,
                area: meta.area || ''
            };
        });

        // Populate shelf filter dropdown
        if (this.ui.dom.shelfFilterSelect) {
            const shelves = [...new Set(this.boxesCache.map(b => b.shelf))].sort();
            shelves.forEach(shelf => {
                const opt = document.createElement('option');
                opt.value = shelf;
                opt.textContent = `Regal ${shelf}`;
                if (this.options.initialShelf) {
                    if (Array.isArray(this.options.initialShelf) && this.options.initialShelf.includes(shelf)) {
                        opt.selected = true;
                    } else if (this.options.initialShelf === shelf) {
                        opt.selected = true;
                    }
                }
                this.ui.dom.shelfFilterSelect.appendChild(opt);
            });
        }

        // Select initial box if configured
        if (this.options.initialBox) {
            const updateCamera = !this.options.camJSON;
            this.selectBox(this.options.initialBox, false, updateCamera);
        }

        this._syncCamJSON();
    }

    /**
     * Binds mouse move, pointer down, and pointer up events on renderer canvas for raycasting.
     * Prevents unintentional box selection during camera navigation (orbit/pan) by tracking
     * drag distance and duration.
     * @private
     */
    _bindRaycastingEvents() {
        const dom = this.mediathek.renderer.domElement;

        this._pointerDownPos = null;
        this._pointerDownTime = 0;
        this._isPointerDragging = false;

        dom.addEventListener('pointerdown', (e) => {
            if (e.button === 0) {
                this._pointerDownPos = { x: e.clientX, y: e.clientY };
                this._pointerDownTime = performance.now();
                this._isPointerDragging = false;
            }
        }, false);

        dom.addEventListener('pointermove', (e) => {
            if (this._pointerDownPos) {
                const dist = Math.hypot(e.clientX - this._pointerDownPos.x, e.clientY - this._pointerDownPos.y);
                if (dist > 5) {
                    this._isPointerDragging = true;
                    this.ui.hideTooltip();
                }
            }
            if (!this._isPointerDragging) {
                this._onPointerMove(e);
            }
        }, false);

        dom.addEventListener('pointerup', (e) => {
            if (e.button === 0 && this._pointerDownPos) {
                const dist = Math.hypot(e.clientX - this._pointerDownPos.x, e.clientY - this._pointerDownPos.y);
                const duration = performance.now() - this._pointerDownTime;
                const isClick = !this._isPointerDragging && dist < 5 && duration < 600;

                this._pointerDownPos = null;
                this._isPointerDragging = false;

                if (isClick) {
                    this._onPointerClick(e);
                }
            }
        }, false);

        window.addEventListener('pointercancel', () => {
            this._pointerDownPos = null;
            this._isPointerDragging = false;
        });

        // Listen for history popstate (e.g. back/forward navigation with ?box=...)
        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const boxParam = urlParams.get('box') || (window.location.hash ? window.location.hash.replace(/^#/, '') : '');
            if (boxParam && boxParam.toUpperCase() !== this.selectedBoxId) {
                this.selectBox(boxParam, true);
            }
        });
    }

    /**
     * Handles pointer move for hover highlighting and tooltip display.
     * @private
     */
    _onPointerMove(event) {
        if (!this.mediathek3D) return;

        const intersects = this.mediathek.raycast(event, this.mediathek3D.children, true);
        const hitBox = this._findBoxInIntersects(intersects);

        if (hitBox) {
            const boxId = hitBox.name || (hitBox.userData && hitBox.userData.id);
            if (boxId) {
                this.hoveredBoxId = boxId;
                const meta = this.mediathek3D.getBoxMetadata(boxId);
                const areaInfo = meta && meta.area ? ` (${meta.area})` : '';
                const idLabel = (meta && meta.id2 && meta.id2 !== boxId) ? `${boxId} / ${meta.id2}` : boxId;
                this.ui.showTooltip(event.clientX, event.clientY, `Kiste ${idLabel}${areaInfo}`);
            }
        } else {
            if (this.hoveredBoxId && this.hoveredBoxId !== this.selectedBoxId) {
                this.hoveredBoxId = null;
            }
            this.ui.hideTooltip();
        }
    }

    /**
     * Handles pointer click (clean click without dragging) for box selection and inspector drawer opening.
     * @private
     */
    _onPointerClick(event) {
        if (!this.mediathek3D) return;

        const intersects = this.mediathek.raycast(event, this.mediathek3D.children, true);
        const hitBox = this._findBoxInIntersects(intersects);

        if (hitBox) {
            const boxId = hitBox.name || (hitBox.userData && hitBox.userData.id);
            if (boxId) {
                this.selectBox(boxId);
            }
        }
    }

    /**
     * Traverses raycast hit hierarchy upward to locate parent box Object3D with userData.
     * @private
     */
    _findBoxInIntersects(intersects) {
        if (!intersects || intersects.length === 0) return null;

        for (let i = 0; i < intersects.length; i++) {
            let obj = intersects[i].object;
            while (obj && obj !== this.mediathek3D && obj !== this.mediathek.scene) {
                if (obj.userData && obj.userData.id) {
                    return obj;
                }
                if (obj.name && this.mediathek3D.boxes && (this.mediathek3D.boxes[obj.name] || this.mediathek3D.boxes[obj.name.toUpperCase()])) {
                    return obj;
                }
                obj = obj.parent;
            }
        }
        return null;
    }

    /**
     * Selects and highlights a box, flies or positions the camera toward it, and opens the info drawer.
     *
     * @param {string} boxId - Box identifier (e.g. "A101").
     * @param {boolean} [animateCamera=true] - Smoothly pan camera to box (if false, positions camera immediately).
     * @param {boolean} [updateCamera=true] - Whether to position the camera toward the selected box.
     */
    selectBox(boxId, animateCamera = true, updateCamera = true) {
        if (!boxId || !this.mediathek3D) return;

        const cleanId = boxId.trim().toUpperCase();
        const worldPos = this.mediathek3D.selectBox(cleanId);

        if (!worldPos) {
            console.warn(`MediathekApp: Box "${cleanId}" not found`);
            return;
        }

        this.selectedBoxId = cleanId;

        // Update URL hash / history
        if (window.history && window.history.replaceState) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('box', cleanId);
            window.history.replaceState(null, '', newUrl.toString());
        }

        // Display Info Drawer
        const metadata = this.mediathek3D.getBoxMetadata(cleanId) || { id: cleanId };
        this.ui.showInfoDrawer(metadata);

        // Smooth camera transition or instant positioning toward selected box from current viewing side
        if (updateCamera && this.mediathek && this.mediathek.controls && this.mediathek.camera) {
            const focus = this.mediathek3D.getBoxFocusTransform(
                cleanId,
                this.mediathek.camera.position
            );

            const camPos = focus ? focus.cameraPos : new THREE.Vector3(worldPos.x, worldPos.y - 800, worldPos.z + 600);
            const targetPos = focus ? focus.targetPos : worldPos;

            if (animateCamera) {
                this.mediathek.animateCameraTo(
                    camPos,
                    targetPos,
                    800
                );
            } else {
                this.mediathek.camera.position.copy(camPos);
                this.mediathek.controls.target.copy(targetPos);
                this.mediathek.camera.lookAt(targetPos);
                this.mediathek.controls.update();
            }
        }

        this._syncCamJSON();
    }

    /**
     * Handles live autocomplete query in search bar.
     * @private
     */
    _onSearchInput(query) {
        if (!query) {
            this.ui.hideSearchResults();
            return;
        }

        const q = query.trim().toUpperCase();
        const matches = this.boxesCache.filter(b => 
            b.id.toUpperCase().includes(q) || 
            (b.id2 && b.id2.toUpperCase().includes(q)) || 
            (b.name && b.name.toUpperCase().includes(q)) ||
            (b.area && b.area.toUpperCase().includes(q))
        ).slice(0, 8);
        this.ui.renderSearchResults(matches);
    }

    /**
     * Handles shelf filter selection changes.
     * @private
     */
    _onShelfFilterChange(selectedShelf) {
        const url = new URL(window.location.href);
        if (selectedShelf) {
            url.searchParams.set('shelf', selectedShelf);
        } else {
            url.searchParams.delete('shelf');
        }
        window.location.href = url.toString();
    }

    /**
     * Applies a Camera 4x4 matrix JSON string.
     * @private
     */
    _onApplyCamJSON(camJsonStr) {
        if (this.mediathek) {
            this.mediathek.setCamJSON(camJsonStr);
        }
    }

    /**
     * Resets the camera to default 3D isometric perspective.
     */
    resetCameraView() {
        if (!this.mediathek) return;

        this.mediathek.animateCameraTo(
            new THREE.Vector3(0, -3200, 3800),
            new THREE.Vector3(0, 0, 0),
            800
        );
    }

    /**
     * Transitions camera to top-down 2D floorplan view.
     */
    setTopCameraView() {
        if (!this.mediathek) return;

        this.mediathek.animateCameraTo(
            new THREE.Vector3(0, -10, 6000),
            new THREE.Vector3(0, 0, 0),
            800
        );
    }

    /**
     * Triggers a high-resolution PNG screenshot download.
     */
    downloadScreenshot() {
        if (!this.mediathek) return;

        const filename = `mediathek3d_${this.selectedBoxId || 'view'}_${Date.now()}.png`;
        this.mediathek.downloadScreenshot(filename, 1920, 1080);
    }

    /**
     * Updates the CamJSON input with the current serialized camera matrix.
     * @private
     */
    _syncCamJSON() {
        if (!this.mediathek) return;
        const json = this.mediathek.getCamJSON();
        this.ui.updateCamJSONTextarea(json);
    }
}

// Export for global browser context
if (typeof window !== 'undefined') {
    window.MediathekApp = MediathekApp;
}
