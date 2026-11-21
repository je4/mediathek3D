/**
 * SplineViewer - High-resolution 2D Canvas Viewer for Mediathek Background, Control Points & Catmull-Rom Splines.
 *
 * Visualizes the 2048x2048 floor plan background image, exact control points from kistendata.json,
 * and smooth Catmull-Rom interpolation splines calculated using Three.js CatmullRomCurve3.
 * Supports smooth Pan & Zoom, layer toggles, shelf selection, and point inspection.
 *
 * @module spline-viewer
 * @version 2.0.0
 */

import * as THREE from 'three';

export class SplineViewer {
    constructor(options = {}) {
        this.options = Object.assign({
            containerSelector: '#spline-canvas-container',
            canvasSelector: '#spline-canvas',
            floorImage: 'static/img/mt_background.png',
            boxData: 'api/boxes',
            initialShelf: '',
            baseURL: ''
        }, options);

        this.container = document.querySelector(this.options.containerSelector);
        this.canvas = document.querySelector(this.options.canvasSelector);
        if (!this.canvas || !this.container) {
            console.error('SplineViewer: Canvas or container element not found.');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        // Floor plan image
        this.bgImage = new Image();
        this.bgImageLoaded = false;
        this.imgWidth = 2048;
        this.imgHeight = 2048;

        // Data models
        this.shelvesData = {};
        this.shelfKeys = [];
        this.shelfColors = {};
        this.visibleShelves = new Set();
        this.selectedShelfKey = null;
        this.hoveredShelfKey = null;
        this.hoveredPoint = null; // { shelfKey, index, x, y }

        // Layer visibility states
        this.layers = {
            showBgImage: true,
            bgOpacity: 0.85,
            showSplines: true,
            showPoints: true,
            showPointLabels: true,
            showShelfLabels: true,
            showPointCoords: false
        };

        // Transform for Pan & Zoom: (screenX = imgX * scale + offsetX)
        this.transform = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };

        // Interaction state
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.mousePos = { imgX: 0, imgY: 0, screenX: 0, screenY: 0 };

        // DOM elements
        this.tooltipEl = document.getElementById('spline-tooltip');
        this.coordValEl = document.getElementById('coord-val');
        this.selectionInfoEl = document.getElementById('selection-info');
        this.selectionTextEl = document.getElementById('selection-text');
        this.shelvesListEl = document.getElementById('shelves-list');
        this.shelvesCountEl = document.getElementById('shelves-count');
        this.detailSectionEl = document.getElementById('shelf-detail-section');
        this.detailTitleEl = document.getElementById('detail-shelf-title');
        this.detailTableEl = document.getElementById('detail-points-table');

        // Color palette for distinct shelf identification
        this.colorPalette = [
            '#e8505b', '#f9d56e', '#54e346', '#00bcd4', '#9c27b0',
            '#ff9800', '#4caf50', '#2196f3', '#e91e63', '#00e676',
            '#ff5722', '#3f51b5', '#009688', '#ffeb3b', '#673ab7',
            '#795548', '#607d8b', '#03a9f4', '#8bc34a', '#ffc107',
            '#1de9b6', '#d500f9', '#ff1744', '#00e5ff'
        ];

        this.init();
    }

    async init() {
        this._bindUIEvents();
        this._bindCanvasEvents();
        this._handleResize();

        // Load background image
        this.bgImage.crossOrigin = 'anonymous';
        this.bgImage.onload = () => {
            this.bgImageLoaded = true;
            this.fitToScreen();
            this.render();
        };
        this.bgImage.src = this.options.floorImage;

        // Fetch shelf box & point data
        await this.loadData();
    }

    async loadData() {
        try {
            const resp = await fetch(this.options.boxData);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            this.shelvesData = await resp.json();
            this.shelfKeys = Object.keys(this.shelvesData).sort();

            if (this.shelvesCountEl) {
                this.shelvesCountEl.textContent = this.shelfKeys.length;
            }

            // Assign colors & calculate Catmull-Rom splines for each shelf
            this.shelfKeys.forEach((key, idx) => {
                this.shelfColors[key] = this.colorPalette[idx % this.colorPalette.length];
                this.visibleShelves.add(key);

                const shelf = this.shelvesData[key];
                if (shelf && shelf.point && shelf.point.length > 0) {
                    // Invert Y coordinate: kistendata.json uses 3D Cartesian coordinates (Y=0 at bottom),
                    // whereas 2D Canvas and background image use Y=0 at top (imgHeight = 2048).
                    shelf.point = shelf.point.map(p => ({
                        x: p.x,
                        y: this.imgHeight - p.y,
                        origY: p.y
                    }));
                }

                if (shelf && shelf.point && shelf.point.length >= 2) {
                    // Convert 2D pixel points to Three.js CatmullRomCurve3
                    const points3D = shelf.point.map(p => new THREE.Vector3(p.x, p.y, 0));
                    const curve = new THREE.CatmullRomCurve3(points3D);
                    const sampleCount = Math.max(100, (shelf.point.length - 1) * 35);
                    shelf.splinePoints = curve.getPoints(sampleCount);
                } else if (shelf && shelf.point && shelf.point.length === 1) {
                    shelf.splinePoints = [{ x: shelf.point[0].x, y: shelf.point[0].y }];
                } else {
                    shelf.splinePoints = [];
                }
            });

            // Handle initial shelf parameter if provided
            if (this.options.initialShelf) {
                const requested = this.options.initialShelf.split(',').map(s => s.trim().toUpperCase());
                if (requested.length > 0 && requested[0]) {
                    this.selectShelf(requested[0]);
                }
            }

            this._populateShelvesList();
            this.render();
        } catch (err) {
            console.error('SplineViewer: Failed to load shelf data:', err);
        }
    }

    _handleResize() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        this.render();
    }

    fitToScreen() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const scaleX = (width * 0.92) / this.imgWidth;
        const scaleY = (height * 0.92) / this.imgHeight;
        const scale = Math.min(scaleX, scaleY);

        this.transform.scale = scale;
        this.transform.offsetX = (width - this.imgWidth * scale) / 2;
        this.transform.offsetY = (height - this.imgHeight * scale) / 2;

        this.render();
    }

    zoom100() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.transform.scale = 1.0;
        this.transform.offsetX = (width - this.imgWidth) / 2;
        this.transform.offsetY = (height - this.imgHeight) / 2;
        this.render();
    }

    zoomAt(screenX, screenY, factor) {
        const newScale = Math.max(0.1, Math.min(15.0, this.transform.scale * factor));
        const actualFactor = newScale / this.transform.scale;

        this.transform.offsetX = screenX - (screenX - this.transform.offsetX) * actualFactor;
        this.transform.offsetY = screenY - (screenY - this.transform.offsetY) * actualFactor;
        this.transform.scale = newScale;

        this.render();
    }

    screenToImage(screenX, screenY) {
        return {
            x: (screenX - this.transform.offsetX) / this.transform.scale,
            y: (screenY - this.transform.offsetY) / this.transform.scale
        };
    }

    imageToScreen(imgX, imgY) {
        return {
            x: imgX * this.transform.scale + this.transform.offsetX,
            y: imgY * this.transform.scale + this.transform.offsetY
        };
    }

    _bindCanvasEvents() {
        window.addEventListener('resize', () => this._handleResize());

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
            this.isDragging = true;
            this.dragStart = { x: e.clientX - this.transform.offsetX, y: e.clientY - this.transform.offsetY };
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.style.cursor = 'grabbing';
        });

        this.canvas.addEventListener('pointermove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const imgCoord = this.screenToImage(screenX, screenY);

            this.mousePos = {
                screenX,
                screenY,
                clientX: e.clientX,
                clientY: e.clientY,
                imgX: Math.round(imgCoord.x),
                imgY: Math.round(imgCoord.y)
            };

            // Update live coordinate HUD
            if (this.coordValEl) {
                const inBounds = imgCoord.x >= 0 && imgCoord.x <= this.imgWidth && imgCoord.y >= 0 && imgCoord.y <= this.imgHeight;
                this.coordValEl.textContent = `X: ${this.mousePos.imgX} | Y: ${this.mousePos.imgY}${inBounds ? '' : ' (außerhalb)'}`;
            }

            if (this.isDragging) {
                this.transform.offsetX = e.clientX - this.dragStart.x;
                this.transform.offsetY = e.clientY - this.dragStart.y;
                this.render();
                return;
            }

            // Hit test for points & splines
            this._handleHitTest(imgCoord.x, imgCoord.y, e.clientX, e.clientY);
        });

        this.canvas.addEventListener('pointerup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.releasePointerCapture(e.pointerId);
                this.canvas.style.cursor = 'crosshair';
            }
        });

        this.canvas.addEventListener('pointercancel', (e) => {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const zoomFactor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
            this.zoomAt(screenX, screenY, zoomFactor);
        }, { passive: false });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const imgCoord = this.screenToImage(screenX, screenY);

            const hit = this._findHit(imgCoord.x, imgCoord.y);
            if (hit) {
                this.selectShelf(hit.shelfKey);
            }
        });

        this.canvas.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.fitToScreen();
        });

        this.canvas.addEventListener('mouseleave', () => {
            if (this.tooltipEl) this.tooltipEl.style.display = 'none';
            this.hoveredPoint = null;
            this.hoveredShelfKey = null;
            this.render();
        });
    }

    _bindUIEvents() {
        // Zoom buttons
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
            const w = this.container.clientWidth / 2;
            const h = this.container.clientHeight / 2;
            this.zoomAt(w, h, 1.25);
        });
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
            const w = this.container.clientWidth / 2;
            const h = this.container.clientHeight / 2;
            this.zoomAt(w, h, 1 / 1.25);
        });
        document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.fitToScreen());
        document.getElementById('btn-zoom-100')?.addEventListener('click', () => this.zoom100());

        // Layer toggles
        document.getElementById('chk-bg-image')?.addEventListener('change', (e) => {
            this.layers.showBgImage = e.target.checked;
            this.render();
        });
        const opacitySlider = document.getElementById('range-bg-opacity');
        const opacityVal = document.getElementById('opacity-val');
        opacitySlider?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            this.layers.bgOpacity = val / 100;
            if (opacityVal) opacityVal.textContent = `${val}%`;
            this.render();
        });
        document.getElementById('chk-splines')?.addEventListener('change', (e) => {
            this.layers.showSplines = e.target.checked;
            this.render();
        });
        document.getElementById('chk-points')?.addEventListener('change', (e) => {
            this.layers.showPoints = e.target.checked;
            this.render();
        });
        document.getElementById('chk-point-labels')?.addEventListener('change', (e) => {
            this.layers.showPointLabels = e.target.checked;
            this.render();
        });
        document.getElementById('chk-shelf-labels')?.addEventListener('change', (e) => {
            this.layers.showShelfLabels = e.target.checked;
            this.render();
        });
        document.getElementById('chk-point-coords')?.addEventListener('change', (e) => {
            this.layers.showPointCoords = e.target.checked;
            this.render();
        });

        // Shelf search filter
        document.getElementById('shelf-search')?.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            this._filterShelvesList(query);
        });

        // Select all / Deselect all
        document.getElementById('btn-select-all')?.addEventListener('click', () => {
            this.shelfKeys.forEach(k => this.visibleShelves.add(k));
            this._updateShelvesCheckboxes();
            this.render();
        });
        document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
            this.visibleShelves.clear();
            this._updateShelvesCheckboxes();
            this.render();
        });

        // Clear selection button
        document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
        });

        // Close detail view button
        document.getElementById('btn-close-detail')?.addEventListener('click', () => {
            this.clearSelection();
        });

        // Toggle sidebar collapse
        const sidebarEl = document.getElementById('splines-sidebar');
        const toggleBtn = document.getElementById('btn-toggle-sidebar');
        toggleBtn?.addEventListener('click', () => {
            if (sidebarEl) {
                sidebarEl.classList.toggle('collapsed');
                toggleBtn.textContent = sidebarEl.classList.contains('collapsed') ? '▶' : '◀';
            }
        });
    }

    _handleHitTest(imgX, imgY, clientX, clientY) {
        const hit = this._findHit(imgX, imgY);

        if (hit) {
            this.hoveredShelfKey = hit.shelfKey;
            this.hoveredPoint = hit.point || null;
            this.canvas.style.cursor = 'pointer';

            if (this.tooltipEl) {
                let html = `<div class="tooltip-title"><span class="badge-dot" style="background:${this.shelfColors[hit.shelfKey]}"></span> Regal ${hit.shelfKey}</div>`;
                const shelf = this.shelvesData[hit.shelfKey];
                if (shelf) {
                    html += `<div class="tooltip-row">Bereich: <strong>${shelf.area || 'N/A'}</strong></div>`;
                    html += `<div class="tooltip-row">Ausrichtung: <strong>${shelf.aside || 'N/A'}</strong></div>`;
                }
                if (hit.point) {
                    html += `<div class="tooltip-divider"></div>`;
                    html += `<div class="tooltip-row">Punkt ${hit.point.index + 1} von ${shelf.point.length}</div>`;
                    const yInfo = hit.point.origY !== undefined ? `Y: ${hit.point.y} <span style="opacity:0.75;font-size:0.85em;">(3D: ${hit.point.origY})</span>` : `Y: ${hit.point.y}`;
                    html += `<div class="tooltip-coords">X: ${hit.point.x} | ${yInfo}</div>`;
                }

                this.tooltipEl.innerHTML = html;
                this.tooltipEl.style.display = 'block';

                // Position tooltip avoiding window edges
                const tooltipWidth = 200;
                const tooltipHeight = 110;
                let posX = clientX + 16;
                let posY = clientY + 16;
                if (posX + tooltipWidth > window.innerWidth) posX = clientX - tooltipWidth - 16;
                if (posY + tooltipHeight > window.innerHeight) posY = clientY - tooltipHeight - 16;

                this.tooltipEl.style.left = `${posX}px`;
                this.tooltipEl.style.top = `${posY}px`;
            }
        } else {
            this.hoveredShelfKey = null;
            this.hoveredPoint = null;
            this.canvas.style.cursor = 'crosshair';
            if (this.tooltipEl) this.tooltipEl.style.display = 'none';
        }

        this.render();
    }

    _findHit(imgX, imgY) {
        const hitThresholdPx = 14 / this.transform.scale;

        // 1. Check points first (higher priority)
        for (const key of this.visibleShelves) {
            const shelf = this.shelvesData[key];
            if (!shelf || !shelf.point) continue;

            for (let i = 0; i < shelf.point.length; i++) {
                const pt = shelf.point[i];
                const dx = pt.x - imgX;
                const dy = pt.y - imgY;
                const dist = Math.hypot(dx, dy);
                if (dist <= hitThresholdPx) {
                    return { shelfKey: key, point: { ...pt, index: i } };
                }
            }
        }

        // 2. Check spline curves
        const splineThresholdPx = 8 / this.transform.scale;
        for (const key of this.visibleShelves) {
            const shelf = this.shelvesData[key];
            if (!shelf || !shelf.splinePoints || shelf.splinePoints.length < 2) continue;

            for (let i = 0; i < shelf.splinePoints.length - 1; i++) {
                const p1 = shelf.splinePoints[i];
                const p2 = shelf.splinePoints[i + 1];
                const dist = this._pointToSegmentDistance(imgX, imgY, p1.x, p1.y, p2.x, p2.y);
                if (dist <= splineThresholdPx) {
                    return { shelfKey: key, point: null };
                }
            }
        }

        return null;
    }

    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    selectShelf(key) {
        if (!this.shelvesData[key]) return;

        this.selectedShelfKey = key;
        this.visibleShelves.add(key);
        this._updateShelvesCheckboxes();

        // Update selection badges
        if (this.selectionInfoEl && this.selectionTextEl) {
            this.selectionTextEl.innerHTML = `<span class="badge-dot" style="background:${this.shelfColors[key]}"></span> Regal ${key} (${this.shelvesData[key].area || ''})`;
            this.selectionInfoEl.style.display = 'inline-flex';
        }

        // Highlight in sidebar list
        document.querySelectorAll('.shelf-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.shelf === key);
        });

        // Show detail table
        this._populateDetailSection(key);

        this.render();
    }

    clearSelection() {
        this.selectedShelfKey = null;
        if (this.selectionInfoEl) this.selectionInfoEl.style.display = 'none';
        if (this.detailSectionEl) this.detailSectionEl.style.display = 'none';

        document.querySelectorAll('.shelf-item').forEach(el => {
            el.classList.remove('selected');
        });

        this.render();
    }

    _populateShelvesList() {
        if (!this.shelvesListEl) return;
        this.shelvesListEl.innerHTML = '';

        this.shelfKeys.forEach(key => {
            const shelf = this.shelvesData[key];
            const color = this.shelfColors[key];
            const ptCount = shelf.point ? shelf.point.length : 0;

            const item = document.createElement('div');
            item.className = 'shelf-item';
            item.dataset.shelf = key;

            item.innerHTML = `
                <label class="shelf-item-checkbox">
                    <input type="checkbox" data-shelf="${key}" ${this.visibleShelves.has(key) ? 'checked' : ''}>
                    <span class="shelf-color-indicator" style="background-color: ${color}"></span>
                </label>
                <div class="shelf-item-info">
                    <span class="shelf-name">Regal ${key}</span>
                    <span class="shelf-area">${shelf.area || 'Allgemein'} (${ptCount} Pkt)</span>
                </div>
                <button class="shelf-focus-btn" title="Auf Regal fokussieren">🔍</button>
            `;

            // Checkbox toggle
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.visibleShelves.add(key);
                } else {
                    this.visibleShelves.delete(key);
                    if (this.selectedShelfKey === key) {
                        this.clearSelection();
                    }
                }
                this.render();
            });

            // Focus on shelf button
            const focusBtn = item.querySelector('.shelf-focus-btn');
            focusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.focusOnShelf(key);
            });

            // Item click: select shelf
            item.addEventListener('click', (e) => {
                if (e.target === checkbox || e.target === focusBtn) return;
                this.selectShelf(key);
            });

            // Hover state
            item.addEventListener('mouseenter', () => {
                this.hoveredShelfKey = key;
                this.render();
            });
            item.addEventListener('mouseleave', () => {
                this.hoveredShelfKey = null;
                this.render();
            });

            this.shelvesListEl.appendChild(item);
        });
    }

    _updateShelvesCheckboxes() {
        if (!this.shelvesListEl) return;
        this.shelvesListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const key = cb.dataset.shelf;
            cb.checked = this.visibleShelves.has(key);
        });
    }

    _filterShelvesList(query) {
        if (!this.shelvesListEl) return;
        const items = this.shelvesListEl.querySelectorAll('.shelf-item');
        items.forEach(item => {
            const key = item.dataset.shelf;
            const shelf = this.shelvesData[key];
            const text = `regal ${key} ${shelf.area || ''}`.toLowerCase();
            item.style.display = text.includes(query) ? 'flex' : 'none';
        });
    }

    _populateDetailSection(key) {
        if (!this.detailSectionEl || !this.detailTableEl || !this.detailTitleEl) return;

        const shelf = this.shelvesData[key];
        if (!shelf || !shelf.point) {
            this.detailSectionEl.style.display = 'none';
            return;
        }

        this.detailTitleEl.innerHTML = `Regal ${key} &bull; <span style="color:var(--text-secondary);font-size:0.85em;">${shelf.area || ''}</span>`;

        let html = `
            <table class="points-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>X</th>
                        <th>Y</th>
                        <th>Aktion</th>
                    </tr>
                </thead>
                <tbody>
        `;

        shelf.point.forEach((p, idx) => {
            const yDisplay = p.origY !== undefined ? `${p.y} <span style="color:var(--text-secondary);font-size:0.85em;">(3D: ${p.origY})</span>` : `${p.y}`;
            html += `
                <tr data-point-idx="${idx}">
                    <td><strong>P${idx + 1}</strong></td>
                    <td>${p.x}</td>
                    <td>${yDisplay}</td>
                    <td><button class="btn-focus-point" data-x="${p.x}" data-y="${p.y}" title="Punkt zentrieren">🎯</button></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        this.detailTableEl.innerHTML = html;
        this.detailSectionEl.style.display = 'block';

        // Bind focus buttons
        this.detailTableEl.querySelectorAll('.btn-focus-point').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const px = parseFloat(btn.dataset.x);
                const py = parseFloat(btn.dataset.y);
                this.focusOnPoint(px, py);
            });
        });
    }

    focusOnShelf(key) {
        const shelf = this.shelvesData[key];
        if (!shelf || !shelf.point || shelf.point.length === 0) return;

        this.selectShelf(key);

        // Calculate bounding box of shelf
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        shelf.point.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const boxWidth = Math.max(100, maxX - minX + 200);
        const boxHeight = Math.max(100, maxY - minY + 200);

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const scale = Math.min((width * 0.8) / boxWidth, (height * 0.8) / boxHeight, 3.0);

        this.transform.scale = scale;
        this.transform.offsetX = width / 2 - centerX * scale;
        this.transform.offsetY = height / 2 - centerY * scale;

        this.render();
    }

    focusOnPoint(x, y) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const scale = Math.max(this.transform.scale, 2.0);

        this.transform.scale = scale;
        this.transform.offsetX = width / 2 - x * scale;
        this.transform.offsetY = height / 2 - y * scale;

        this.render();
    }

    render() {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const dpr = this.dpr;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Reset transform & clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // Apply DPI and Pan/Zoom Transformation
        ctx.setTransform(
            dpr * this.transform.scale, 0,
            0, dpr * this.transform.scale,
            dpr * this.transform.offsetX,
            dpr * this.transform.offsetY
        );

        // 1. Draw Background Image
        if (this.layers.showBgImage && this.bgImageLoaded) {
            ctx.save();
            ctx.globalAlpha = this.layers.bgOpacity;
            ctx.drawImage(this.bgImage, 0, 0, this.imgWidth, this.imgHeight);

            // Subtle border around floor plan
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1 / this.transform.scale;
            ctx.strokeRect(0, 0, this.imgWidth, this.imgHeight);
            ctx.restore();
        }

        // 2. Draw Splines (Catmull-Rom Curves)
        if (this.layers.showSplines) {
            this.shelfKeys.forEach(key => {
                if (!this.visibleShelves.has(key)) return;

                const shelf = this.shelvesData[key];
                if (!shelf || !shelf.splinePoints || shelf.splinePoints.length < 2) return;

                const isSelected = this.selectedShelfKey === key;
                const isHovered = this.hoveredShelfKey === key;
                const color = this.shelfColors[key] || '#ffffff';

                ctx.save();

                // Glow / outer stroke for selected or hovered shelf
                if (isSelected || isHovered) {
                    ctx.beginPath();
                    ctx.moveTo(shelf.splinePoints[0].x, shelf.splinePoints[0].y);
                    for (let i = 1; i < shelf.splinePoints.length; i++) {
                        ctx.lineTo(shelf.splinePoints[i].x, shelf.splinePoints[i].y);
                    }
                    ctx.strokeStyle = isSelected ? '#ffffff' : color;
                    ctx.lineWidth = (isSelected ? 9 : 7) / this.transform.scale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.globalAlpha = 0.5;
                    ctx.stroke();
                }

                // Main Spline curve stroke
                ctx.beginPath();
                ctx.moveTo(shelf.splinePoints[0].x, shelf.splinePoints[0].y);
                for (let i = 1; i < shelf.splinePoints.length; i++) {
                    ctx.lineTo(shelf.splinePoints[i].x, shelf.splinePoints[i].y);
                }

                ctx.strokeStyle = color;
                ctx.lineWidth = (isSelected ? 4.5 : isHovered ? 3.5 : 2.5) / this.transform.scale;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = (this.selectedShelfKey && !isSelected) ? 0.35 : 1.0;
                ctx.stroke();

                ctx.restore();
            });
        }

        // 3. Draw Control Points & Point Labels
        if (this.layers.showPoints) {
            this.shelfKeys.forEach(key => {
                if (!this.visibleShelves.has(key)) return;

                const shelf = this.shelvesData[key];
                if (!shelf || !shelf.point) return;

                const isSelected = this.selectedShelfKey === key;
                const isShelfHovered = this.hoveredShelfKey === key;
                const color = this.shelfColors[key] || '#ffffff';

                shelf.point.forEach((pt, idx) => {
                    const isPtHovered = this.hoveredPoint && this.hoveredPoint.shelfKey === key && this.hoveredPoint.index === idx;
                    const radius = (isPtHovered ? 8 : isSelected ? 6.5 : isShelfHovered ? 5.5 : 4.5) / this.transform.scale;

                    ctx.save();
                    ctx.globalAlpha = (this.selectedShelfKey && !isSelected) ? 0.35 : 1.0;

                    // Outer colored ring
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();

                    // Inner white core
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, radius * 0.55, 0, Math.PI * 2);
                    ctx.fillStyle = isPtHovered ? '#ffff00' : '#ffffff';
                    ctx.fill();

                    // Point border
                    ctx.strokeStyle = '#232629';
                    ctx.lineWidth = 1.2 / this.transform.scale;
                    ctx.stroke();

                    // Point label (P1, P2...)
                    if (this.layers.showPointLabels && (isSelected || isShelfHovered || isPtHovered || this.transform.scale > 0.8)) {
                        const fontSize = Math.max(10, Math.min(16, 12 / this.transform.scale));
                        ctx.font = `600 ${fontSize}px sans-serif`;
                        ctx.fillStyle = '#ffffff';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.strokeStyle = '#1c2420';
                        ctx.lineWidth = 3 / this.transform.scale;
                        ctx.strokeText(`P${idx + 1}`, pt.x, pt.y - radius - (2 / this.transform.scale));
                        ctx.fillText(`P${idx + 1}`, pt.x, pt.y - radius - (2 / this.transform.scale));
                    }

                    // Point Coordinates Label
                    if (this.layers.showPointCoords && (isSelected || isPtHovered || this.transform.scale > 1.2)) {
                        const fontSize = Math.max(9, Math.min(13, 10 / this.transform.scale));
                        ctx.font = `400 ${fontSize}px monospace`;
                        ctx.fillStyle = '#f9d56e';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.strokeStyle = '#1c2420';
                        ctx.lineWidth = 2.5 / this.transform.scale;
                        ctx.strokeText(`(${pt.x}, ${pt.y})`, pt.x, pt.y + radius + (3 / this.transform.scale));
                        ctx.fillText(`(${pt.x}, ${pt.y})`, pt.x, pt.y + radius + (3 / this.transform.scale));
                    }

                    ctx.restore();
                });
            });
        }

        // 4. Draw Shelf Badges / Labels
        if (this.layers.showShelfLabels) {
            this.shelfKeys.forEach(key => {
                if (!this.visibleShelves.has(key)) return;

                const shelf = this.shelvesData[key];
                if (!shelf || !shelf.point || shelf.point.length === 0) return;

                const isSelected = this.selectedShelfKey === key;
                const isHovered = this.hoveredShelfKey === key;
                const color = this.shelfColors[key] || '#ffffff';

                // Place badge near start of shelf
                const startPt = shelf.point[0];
                const badgeRadius = (isSelected ? 13 : isHovered ? 12 : 10) / this.transform.scale;

                ctx.save();
                ctx.globalAlpha = (this.selectedShelfKey && !isSelected) ? 0.4 : 1.0;

                // Badge circle background
                ctx.beginPath();
                ctx.arc(startPt.x - (16 / this.transform.scale), startPt.y, badgeRadius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5 / this.transform.scale;
                ctx.stroke();

                // Shelf Letter
                const fontSize = Math.max(10, Math.min(16, (badgeRadius * 1.2)));
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 3;
                ctx.fillText(key, startPt.x - (16 / this.transform.scale), startPt.y);

                ctx.restore();
            });
        }
    }
}
