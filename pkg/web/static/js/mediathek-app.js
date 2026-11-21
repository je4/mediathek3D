/**
 * MediathekApp - Interactive UI Controller & Application Orchestrator.
 *
 * Coordinates 3D scene rendering, user input, raycasting, search with autocomplete,
 * URL hash routing, camera presets, box info inspection drawer, camera JSON serialization,
 * and high-resolution screenshot export.
 *
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.0.0
 */
class MediathekApp {
    /**
     * Initializes the complete Mediathek 3D web application.
     *
     * @param {Object} options Application configuration options.
     * @param {string} [options.containerSelector='#renderer-container'] Viewport container selector.
     * @param {string} [options.floorImage='static/img/mt_background.png'] Floor map image path.
     * @param {string} [options.boxData='api/boxes'] Shelf geometry JSON endpoint.
     * @param {string} [options.initialBox=''] Initially highlighted box (from URL or Go template).
     * @param {Array<string>|string} [options.initialShelf=''] Initial shelf filter.
     * @param {string} [options.camJSON=null] Initial camera JSON matrix string.
     * @param {boolean} [options.isEmbed=false] Embedded / minimal UI mode.
     */
    constructor(options = {}) {
        this.options = Object.assign({
            containerSelector: '#renderer-container',
            floorImage: 'static/img/mt_background.png',
            boxData: 'api/boxes',
            initialBox: '',
            initialShelf: '',
            camJSON: null,
            isEmbed: false
        }, options);

        this.mediathek = null;
        this.mediathek3D = null;
        this.selectedBoxId = null;
        this.hoveredBoxId = null;
        this.boxesCache = [];

        // UI DOM Elements
        this.dom = {
            container: document.querySelector(this.options.containerSelector) || document.body,
            tooltip: document.getElementById('box-tooltip'),
            searchForm: document.getElementById('search-form'),
            searchInput: document.getElementById('search-input'),
            searchResults: document.getElementById('search-results'),
            infoDrawer: document.getElementById('box-info-drawer'),
            infoTitle: document.getElementById('box-info-title'),
            infoShelf: document.getElementById('box-info-shelf'),
            infoLevel: document.getElementById('box-info-level'),
            infoIndex: document.getElementById('box-info-index'),
            infoArea: document.getElementById('box-info-area'),
            infoLink: document.getElementById('box-info-link'),
            infoCloseBtn: document.getElementById('box-info-close'),
            camJsonTextarea: document.getElementById('cam-json-textarea'),
            camJsonApplyBtn: document.getElementById('cam-json-apply-btn'),
            camJsonCopyBtn: document.getElementById('cam-json-copy-btn'),
            btnResetView: document.getElementById('btn-reset-view'),
            btnTopView: document.getElementById('btn-top-view'),
            btnScreenshot: document.getElementById('btn-screenshot'),
            btnFullscreen: document.getElementById('btn-fullscreen'),
            btnHelp: document.getElementById('btn-help'),
            helpModal: document.getElementById('help-modal'),
            helpCloseBtn: document.getElementById('help-close-btn'),
            loadingOverlay: document.getElementById('loading-overlay'),
            shelfFilterSelect: document.getElementById('shelf-filter-select')
        };

        this._parseURLParams();
        this._init3D();
        this._bindEvents();
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

        if (urlParams.has('cam')) {
            this.options.camJSON = urlParams.get('cam');
        }

        if (urlParams.has('mode') && urlParams.get('mode') === 'embed') {
            this.options.isEmbed = true;
        }
    }

    /**
     * Instantiates Mediathek core and Mediathek3D geometry graph.
     * @private
     */
    _init3D() {
        this.mediathek = new Mediathek({
            renderDOM: this.dom.container,
            camType: 'perspective',
            backgroundColor: 0x283744,
            camJSON: this.options.camJSON,
            controlType: 'orbit',
            doWindowResize: true,
            antialias: true
        });

        const drawOnly = this.options.initialShelf || (this.options.initialBox ? [this.options.initialBox] : null);

        this.mediathek3D = new Mediathek3D({
            floorImage: this.options.floorImage,
            boxData: this.options.boxData,
            pixelFactor: 4,
            boxDelay: 0,
            drawOnly: drawOnly
        }, (object3D) => {
            this._onSceneReady(object3D);
        });

        this.mediathek.scene.add(this.mediathek3D);
        this.mediathek.animate();
    }

    /**
     * Callback when Mediathek3D finishes loading textures and generating geometries.
     * @private
     */
    _onSceneReady(object3D) {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.add('d-none');
            this.dom.loadingOverlay.style.display = 'none';
        }

        // Cache all box names for search autocomplete
        this.boxesCache = this.mediathek3D.getAllBoxNames();
        this._populateShelfFilter();

        // Highlight initial box if present
        if (this.options.initialBox) {
            this.selectBox(this.options.initialBox, true);
        }

        // Dispatch ready event
        window.dispatchEvent(new CustomEvent('mediathek:ready', {
            detail: { app: this, boxesCount: this.boxesCache.length }
        }));
    }

    /**
     * Populates shelf filter dropdown if element exists.
     * @private
     */
    _populateShelfFilter() {
        if (!this.dom.shelfFilterSelect) return;

        const shelfLetters = new Set();
        this.boxesCache.forEach(id => shelfLetters.add(id.charAt(0)));
        const sortedShelves = Array.from(shelfLetters).sort();

        sortedShelves.forEach(shelf => {
            const opt = document.createElement('option');
            opt.value = shelf;
            opt.textContent = `Shelf ${shelf}`;
            this.dom.shelfFilterSelect.appendChild(opt);
        });
    }

    /**
     * Sets up DOM events, pointer interaction, raycasting, and keyboard shortcuts.
     * @private
     */
    _bindEvents() {
        const domElement = this.mediathek.renderer.domElement;

        // Pointer click for raycast selection
        let downPos = { x: 0, y: 0 };
        domElement.addEventListener('pointerdown', (e) => {
            downPos = { x: e.clientX, y: e.clientY };
        });

        domElement.addEventListener('pointerup', (e) => {
            const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
            if (dist < 5) { // Click, not drag
                this._onPointerClick(e);
            }
        });

        // Pointer move for hover tooltips
        domElement.addEventListener('pointermove', (e) => {
            this._onPointerMove(e);
        });

        domElement.addEventListener('pointerleave', () => {
            this._hideTooltip();
        });

        // Hash change navigation
        window.addEventListener('hashchange', () => {
            const hashBox = window.location.hash.replace(/^#/, '');
            if (hashBox && hashBox !== this.selectedBoxId) {
                this.selectBox(hashBox, true);
            }
        });

        // Search form handling
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', (e) => this._onSearchInput(e.target.value));
            this.dom.searchInput.addEventListener('keydown', (e) => this._onSearchKeyDown(e));
        }

        if (this.dom.searchForm) {
            this.dom.searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (this.dom.searchInput) {
                    const val = this.dom.searchInput.value.trim();
                    if (val) this.selectBox(val, true);
                }
            });
        }

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dom.searchResults && !e.target.closest('#search-container')) {
                this.dom.searchResults.classList.add('d-none');
            }
        });

        // Info drawer close button
        if (this.dom.infoCloseBtn) {
            this.dom.infoCloseBtn.addEventListener('click', () => {
                this._closeInfoDrawer();
            });
        }

        // Camera presets
        if (this.dom.btnResetView) {
            this.dom.btnResetView.addEventListener('click', () => this.mediathek.resetView());
        }
        if (this.dom.btnTopView) {
            this.dom.btnTopView.addEventListener('click', () => this.mediathek.topView());
        }

        // Screenshot capture
        if (this.dom.btnScreenshot) {
            this.dom.btnScreenshot.addEventListener('click', () => {
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                this.mediathek.captureScreenshot(`mediathek3d-${ts}.png`);
            });
        }

        // Fullscreen toggle
        if (this.dom.btnFullscreen) {
            this.dom.btnFullscreen.addEventListener('click', () => this._toggleFullscreen());
        }

        // Help Modal
        if (this.dom.btnHelp && this.dom.helpModal) {
            this.dom.btnHelp.addEventListener('click', () => {
                this.dom.helpModal.classList.remove('d-none');
                this.dom.helpModal.style.display = 'flex';
            });
        }
        if (this.dom.helpCloseBtn && this.dom.helpModal) {
            this.dom.helpCloseBtn.addEventListener('click', () => {
                this.dom.helpModal.classList.add('d-none');
                this.dom.helpModal.style.display = 'none';
            });
        }

        // CamJSON textarea syncing & application
        if (this.dom.camJsonTextarea) {
            // Update textarea when user clicks or focuses it with current matrix
            this.dom.camJsonTextarea.addEventListener('focus', () => {
                this.dom.camJsonTextarea.value = this.mediathek.getCamJSON();
            });

            this.dom.camJsonTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._applyCamJSON();
                }
            });
        }

        if (this.dom.camJsonApplyBtn) {
            this.dom.camJsonApplyBtn.addEventListener('click', () => this._applyCamJSON());
        }

        if (this.dom.camJsonCopyBtn) {
            this.dom.camJsonCopyBtn.addEventListener('click', () => {
                const json = this.mediathek.getCamJSON();
                navigator.clipboard.writeText(json).then(() => {
                    const origText = this.dom.camJsonCopyBtn.textContent;
                    this.dom.camJsonCopyBtn.textContent = 'Copied!';
                    setTimeout(() => { this.dom.camJsonCopyBtn.textContent = origText; }, 1500);
                });
            });
        }

        // Shelf filter select
        if (this.dom.shelfFilterSelect) {
            this.dom.shelfFilterSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                this.mediathek3D.setBoxFilter(val ? val : null);
            });
        }

        // Global keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) {
                return;
            }

            switch (e.key) {
                case 'r':
                case 'R':
                    this.mediathek.resetView();
                    break;
                case 't':
                case 'T':
                    this.mediathek.topView();
                    break;
                case 'f':
                case 'F':
                    this._toggleFullscreen();
                    break;
                case 'Escape':
                    this._closeInfoDrawer();
                    if (this.dom.helpModal) {
                        this.dom.helpModal.classList.add('d-none');
                        this.dom.helpModal.style.display = 'none';
                    }
                    break;
                case '/':
                    e.preventDefault();
                    if (this.dom.searchInput) this.dom.searchInput.focus();
                    break;
            }
        });
    }

    /**
     * Handles pointer click raycast on 3D shelves.
     * @private
     */
    _onPointerClick(event) {
        if (!this.mediathek3D) return;

        const boxMeshes = Object.values(this.mediathek3D.boxes);
        const intersects = this.mediathek.raycast(event.clientX, event.clientY, boxMeshes, true);

        if (intersects.length > 0) {
            // Traverse up to find box root with userData
            let obj = intersects[0].object;
            while (obj && !obj.userData?.id && obj.parent && obj !== this.mediathek3D) {
                obj = obj.parent;
            }

            if (obj && obj.userData && obj.userData.id) {
                this.selectBox(obj.userData.id, true);
            }
        }
    }

    /**
     * Handles pointer hover raycast for fast tooltips.
     * @private
     */
    _onPointerMove(event) {
        if (!this.mediathek3D || !this.dom.tooltip) return;

        const boxMeshes = Object.values(this.mediathek3D.boxes);
        const intersects = this.mediathek.raycast(event.clientX, event.clientY, boxMeshes, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj && !obj.userData?.id && obj.parent && obj !== this.mediathek3D) {
                obj = obj.parent;
            }

            if (obj && obj.userData && obj.userData.id) {
                const boxId = obj.userData.id;
                const area = obj.userData.area || '';
                this._showTooltip(event.clientX, event.clientY, boxId, area);
                this.dom.container.style.cursor = 'pointer';
                return;
            }
        }

        this._hideTooltip();
        this.dom.container.style.cursor = 'default';
    }

    /**
     * Displays a lightweight floating tooltip near mouse pointer.
     * @private
     */
    _showTooltip(clientX, clientY, boxId, area) {
        if (!this.dom.tooltip) return;
        this.dom.tooltip.innerHTML = `<strong>${boxId}</strong>${area ? `<span class="tooltip-area">${area}</span>` : ''}`;
        this.dom.tooltip.style.left = `${clientX + 14}px`;
        this.dom.tooltip.style.top = `${clientY + 14}px`;
        this.dom.tooltip.classList.remove('d-none');
        this.dom.tooltip.style.display = 'block';
    }

    /**
     * Hides hover tooltip.
     * @private
     */
    _hideTooltip() {
        if (this.dom.tooltip) {
            this.dom.tooltip.classList.add('d-none');
            this.dom.tooltip.style.display = 'none';
        }
    }

    /**
     * Selects and highlights a box, animates camera focus, updates URL hash, and opens details drawer.
     *
     * @param {string} boxId Target box identifier (e.g. "A101").
     * @param {boolean} [animateCamera=true] Whether to smoothly focus camera on target box.
     */
    selectBox(boxId, animateCamera = true) {
        if (!boxId || !this.mediathek3D) return;

        const id = boxId.toUpperCase().trim();
        const box = this.mediathek3D.getBox(id);

        if (!box) {
            console.warn(`Box "${id}" not found`);
            return;
        }

        // Clear existing highlights and highlight selected
        this.mediathek3D.clearHighlight();
        this.mediathek3D.boxHighlight(id, true);
        this.selectedBoxId = id;

        // Smoothly pan camera to look at the box
        if (animateCamera) {
            const worldPos = new THREE.Vector3();
            box.getWorldPosition(worldPos);
            this.mediathek.focusOn(worldPos);
        }

        // Update URL hash without reload
        if (window.location.hash !== `#${id}`) {
            history.replaceState(null, '', `#${id}`);
        }

        // Open details info drawer
        this._showInfoDrawer(box.userData);

        // Update CamJSON preview in textarea
        if (this.dom.camJsonTextarea) {
            this.dom.camJsonTextarea.value = this.mediathek.getCamJSON();
        }

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('mediathek:boxselected', {
            detail: { boxId: id, data: box.userData }
        }));
    }

    /**
     * Displays the box information drawer / card.
     * @private
     */
    _showInfoDrawer(data) {
        if (!this.dom.infoDrawer || !data) return;

        if (this.dom.infoTitle) this.dom.infoTitle.textContent = `Box ${data.id}`;
        if (this.dom.infoShelf) this.dom.infoShelf.textContent = data.shelf || '-';
        if (this.dom.infoLevel) this.dom.infoLevel.textContent = data.level || '-';
        if (this.dom.infoIndex) this.dom.infoIndex.textContent = data.index || '-';
        if (this.dom.infoArea) this.dom.infoArea.textContent = data.area || 'General';
        if (this.dom.infoLink) {
            this.dom.infoLink.href = `#${data.id}`;
            this.dom.infoLink.textContent = `#${data.id}`;
        }

        this.dom.infoDrawer.classList.remove('d-none');
        this.dom.infoDrawer.classList.add('active');
        this.dom.infoDrawer.style.display = 'block';
    }

    /**
     * Closes the box info drawer.
     * @private
     */
    _closeInfoDrawer() {
        if (!this.dom.infoDrawer) return;
        this.dom.infoDrawer.classList.remove('active');
        this.dom.infoDrawer.classList.add('d-none');
        this.dom.infoDrawer.style.display = 'none';
    }

    /**
     * Filters box suggestions for live search bar.
     * @private
     */
    _onSearchInput(query) {
        if (!this.dom.searchResults) return;

        const q = query.toUpperCase().trim();
        if (!q) {
            this.dom.searchResults.classList.add('d-none');
            this.dom.searchResults.innerHTML = '';
            return;
        }

        const matches = this.boxesCache.filter(boxId => boxId.includes(q)).slice(0, 10);

        if (matches.length === 0) {
            this.dom.searchResults.innerHTML = '<div class="search-item no-match">No matching boxes found</div>';
        } else {
            this.dom.searchResults.innerHTML = matches.map(boxId => {
                const shelf = boxId.charAt(0);
                const lvl = boxId.charAt(1);
                return `
                    <div class="search-item" data-box="${boxId}">
                        <span class="search-box-id">${boxId}</span>
                        <span class="search-box-meta">Shelf ${shelf}, Level ${lvl}</span>
                    </div>
                `;
            }).join('');

            // Click listener for items
            this.dom.searchResults.querySelectorAll('.search-item[data-box]').forEach(el => {
                el.addEventListener('click', () => {
                    const boxId = el.getAttribute('data-box');
                    if (this.dom.searchInput) this.dom.searchInput.value = boxId;
                    this.dom.searchResults.classList.add('d-none');
                    this.selectBox(boxId, true);
                });
            });
        }

        this.dom.searchResults.classList.remove('d-none');
    }

    /**
     * Handles keyboard navigation in search autocomplete dropdown.
     * @private
     */
    _onSearchKeyDown(event) {
        if (!this.dom.searchResults || this.dom.searchResults.classList.contains('d-none')) return;

        const items = Array.from(this.dom.searchResults.querySelectorAll('.search-item[data-box]'));
        if (items.length === 0) return;

        let activeIndex = items.findIndex(el => el.classList.contains('active'));

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (activeIndex >= 0) items[activeIndex].classList.remove('active');
            activeIndex = (activeIndex + 1) % items.length;
            items[activeIndex].classList.add('active');
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (activeIndex >= 0) items[activeIndex].classList.remove('active');
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            items[activeIndex].classList.add('active');
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            if (activeIndex >= 0) {
                event.preventDefault();
                const boxId = items[activeIndex].getAttribute('data-box');
                if (this.dom.searchInput) this.dom.searchInput.value = boxId;
                this.dom.searchResults.classList.add('d-none');
                this.selectBox(boxId, true);
            }
        } else if (event.key === 'Escape') {
            this.dom.searchResults.classList.add('d-none');
        }
    }

    /**
     * Parses and applies CamJSON from textarea.
     * @private
     */
    _applyCamJSON() {
        if (!this.dom.camJsonTextarea) return;
        const val = this.dom.camJsonTextarea.value.trim();
        if (!val) return;

        const success = this.mediathek.setCamJSON(val);
        if (success) {
            this.dom.camJsonTextarea.classList.add('is-valid');
            setTimeout(() => this.dom.camJsonTextarea.classList.remove('is-valid'), 1000);
        } else {
            this.dom.camJsonTextarea.classList.add('is-invalid');
            setTimeout(() => this.dom.camJsonTextarea.classList.remove('is-invalid'), 1000);
        }
    }

    /**
     * Toggles browser fullscreen mode.
     * @private
     */
    _toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`Fullscreen error: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
}

// Export for global browser context
if (typeof window !== 'undefined') {
    window.MediathekApp = MediathekApp;
}
