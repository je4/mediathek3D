/**
 * Mediathek3D UI & Interaction Controller Module.
 *
 * Manages DOM elements, search input autocomplete, interactive tooltips,
 * box information inspection drawer, camera JSON import/export, HUD presets,
 * screenshot capture, fullscreen toggle, and help modals.
 *
 * @module modules/ui-controller
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

export class UIController {
    /**
     * Initializes the UIController and discovers all required HUD DOM elements.
     *
     * @param {Object} options - Controller options and event callbacks.
     * @param {HTMLElement|string} [options.container] - Viewport container element or selector.
     * @param {Function} [options.onSearchSelect] - Callback when a search result item is clicked (boxId).
     * @param {Function} [options.onSearchInput] - Callback on search input change (query).
     * @param {Function} [options.onShelfFilterChange] - Callback when shelf filter changes (shelfKey).
     * @param {Function} [options.onApplyCamJSON] - Callback to apply camera matrix (camJsonStr).
     * @param {Function} [options.onResetView] - Callback for reset view button.
     * @param {Function} [options.onTopView] - Callback for top-down view button.
     * @param {Function} [options.onScreenshot] - Callback for screenshot button.
     * @param {Function} [options.onThemeChange] - Callback when theme selection changes (themeId).
     * @param {Function} [options.onCycleTheme] - Callback to cycle to next theme.
     */
    constructor(options = {}) {
        this.options = options;

        // Resolve container
        if (typeof options.container === 'string') {
            this.container = document.querySelector(options.container) || document.body;
        } else {
            this.container = options.container || document.body;
        }

        // Cache all HUD and Modal DOM elements
        this.dom = {
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
            shelfFilterSelect: document.getElementById('shelf-filter-select'),
            themeSelect: document.getElementById('theme-select')
        };

        this._bindUIEvents();
    }

    /**
     * Binds click, input, keydown, and change events to UI elements.
     * @private
     */
    _bindUIEvents() {
        // 1. Search input & autocomplete
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (typeof this.options.onSearchInput === 'function') {
                    this.options.onSearchInput(query);
                }
            });

            this.dom.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hideSearchResults();
                }
            });
        }

        if (this.dom.searchForm) {
            this.dom.searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (this.dom.searchInput) {
                    const query = this.dom.searchInput.value.trim().toUpperCase();
                    if (query && typeof this.options.onSearchSelect === 'function') {
                        this.options.onSearchSelect(query);
                        this.hideSearchResults();
                    }
                }
            });
        }

        // Close search results on click outside
        document.addEventListener('click', (e) => {
            if (this.dom.searchForm && !this.dom.searchForm.contains(e.target)) {
                this.hideSearchResults();
            }
        });

        // 2. Info Drawer close button
        if (this.dom.infoCloseBtn) {
            this.dom.infoCloseBtn.addEventListener('click', () => {
                this.closeInfoDrawer();
            });
        }

        // 3. Camera JSON buttons
        if (this.dom.camJsonApplyBtn && this.dom.camJsonTextarea) {
            this.dom.camJsonApplyBtn.addEventListener('click', () => {
                const val = this.dom.camJsonTextarea.value.trim();
                if (val && typeof this.options.onApplyCamJSON === 'function') {
                    this.options.onApplyCamJSON(val);
                }
            });
        }

        if (this.dom.camJsonCopyBtn && this.dom.camJsonTextarea) {
            this.dom.camJsonCopyBtn.addEventListener('click', () => {
                this.copyCamJSON();
            });
        }

        // 4. Action buttons
        if (this.dom.btnResetView) {
            this.dom.btnResetView.addEventListener('click', () => {
                if (typeof this.options.onResetView === 'function') {
                    this.options.onResetView();
                }
            });
        }

        if (this.dom.btnTopView) {
            this.dom.btnTopView.addEventListener('click', () => {
                if (typeof this.options.onTopView === 'function') {
                    this.options.onTopView();
                }
            });
        }

        if (this.dom.btnScreenshot) {
            this.dom.btnScreenshot.addEventListener('click', () => {
                if (typeof this.options.onScreenshot === 'function') {
                    this.options.onScreenshot();
                }
            });
        }

        if (this.dom.btnFullscreen) {
            this.dom.btnFullscreen.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        // 5. Help modal
        if (this.dom.btnHelp) {
            this.dom.btnHelp.addEventListener('click', () => {
                this.showHelpModal(true);
            });
        }

        if (this.dom.helpCloseBtn) {
            this.dom.helpCloseBtn.addEventListener('click', () => {
                this.showHelpModal(false);
            });
        }

        if (this.dom.helpModal) {
            this.dom.helpModal.addEventListener('click', (e) => {
                if (e.target === this.dom.helpModal) {
                    this.showHelpModal(false);
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            if (e.key === 'Escape') {
                this.showHelpModal(false);
                this.closeInfoDrawer();
            } else if (e.key === 'r' || e.key === 'R') {
                if (typeof this.options.onResetView === 'function') {
                    this.options.onResetView();
                }
            } else if (e.key === 't' || e.key === 'T') {
                if (typeof this.options.onTopView === 'function') {
                    this.options.onTopView();
                }
            } else if (e.key === 'f' || e.key === 'F') {
                this.toggleFullscreen();
            } else if (e.key === 'c' || e.key === 'C') {
                if (typeof this.options.onCycleTheme === 'function') {
                    this.options.onCycleTheme();
                }
            } else if (e.key === 'h' || e.key === 'H' || e.key === '?') {
                const isVisible = this.dom.helpModal &&
                    !this.dom.helpModal.classList.contains('d-none') &&
                    !this.dom.helpModal.classList.contains('hidden') &&
                    this.dom.helpModal.style.display !== 'none';
                this.showHelpModal(!isVisible);
            } else if (e.key === '/') {
                e.preventDefault();
                if (this.dom.searchInput) {
                    this.dom.searchInput.focus();
                }
            }
        });

        // 6. Shelf filter dropdown
        if (this.dom.shelfFilterSelect) {
            this.dom.shelfFilterSelect.addEventListener('change', (e) => {
                const selectedShelf = e.target.value;
                if (typeof this.options.onShelfFilterChange === 'function') {
                    this.options.onShelfFilterChange(selectedShelf);
                }
            });
        }

        // 7. Theme selector dropdown
        if (this.dom.themeSelect) {
            this.dom.themeSelect.addEventListener('change', (e) => {
                const selectedTheme = e.target.value;
                if (typeof this.options.onThemeChange === 'function') {
                    this.options.onThemeChange(selectedTheme);
                }
            });
        }
    }

    /**
     * Updates and displays the search autocomplete dropdown list.
     *
     * @param {Array<{id: string, shelf: string, level: number, index: number, area: string}>} results - Matches.
     */
    renderSearchResults(results) {
        if (!this.dom.searchResults) return;

        if (!results || results.length === 0) {
            this.dom.searchResults.innerHTML = '<div class="search-result-item no-match">Keine Treffer</div>';
            this.dom.searchResults.classList.remove('d-none', 'hidden');
            return;
        }

        const itemsHTML = results.map(box => {
            const idLabel = (box.id2 && box.id2 !== box.id) ? `${box.id} / ${box.id2}` : box.id;
            return `
            <div class="search-result-item" data-box-id="${box.id}">
                <span class="box-id">${idLabel}</span>
                <span class="box-area">${box.area || `Regal ${box.shelf}`}</span>
            </div>
            `;
        }).join('');

        this.dom.searchResults.innerHTML = itemsHTML;
        this.dom.searchResults.classList.remove('d-none', 'hidden');

        // Bind click on items
        const itemEls = this.dom.searchResults.querySelectorAll('.search-result-item[data-box-id]');
        itemEls.forEach(el => {
            el.addEventListener('click', () => {
                const boxId = el.getAttribute('data-box-id');
                if (boxId && typeof this.options.onSearchSelect === 'function') {
                    this.options.onSearchSelect(boxId);
                }
                this.hideSearchResults();
            });
        });
    }

    /**
     * Hides the search autocomplete results dropdown.
     */
    hideSearchResults() {
        if (this.dom.searchResults) {
            this.dom.searchResults.classList.add('d-none', 'hidden');
        }
    }

    /**
     * Displays and populates the box information drawer.
     *
     * @param {Object} boxData - Box metadata object.
     */
    showInfoDrawer(boxData) {
        if (!this.dom.infoDrawer) return;

        const idLabel = (boxData.id2 && boxData.id2 !== boxData.id) ? `${boxData.id} / ${boxData.id2}` : boxData.id;
        const indexLabel = (boxData.index2 && boxData.index2 !== boxData.index) ? `${boxData.index} / ${boxData.index2}` : (boxData.index || '-');

        if (this.dom.infoTitle) this.dom.infoTitle.textContent = `Kiste ${idLabel}`;
        if (this.dom.infoShelf) this.dom.infoShelf.textContent = boxData.shelf || '-';
        if (this.dom.infoLevel) this.dom.infoLevel.textContent = boxData.level || '-';
        if (this.dom.infoIndex) this.dom.infoIndex.textContent = indexLabel;
        if (this.dom.infoArea) this.dom.infoArea.textContent = boxData.area || 'Allgemein';

        if (this.dom.infoLink) {
            this.dom.infoLink.href = `?box=${encodeURIComponent(boxData.id)}`;
        }

        this.dom.infoDrawer.classList.remove('d-none', 'hidden');
    }

    /**
     * Closes the box information drawer.
     */
    closeInfoDrawer() {
        if (this.dom.infoDrawer) {
            this.dom.infoDrawer.classList.add('d-none', 'hidden');
        }
    }

    /**
     * Positions and shows the floating hover tooltip.
     *
     * @param {number} x - Client X coordinate.
     * @param {number} y - Client Y coordinate.
     * @param {string} text - Tooltip text content.
     */
    showTooltip(x, y, text) {
        if (!this.dom.tooltip) return;
        this.dom.tooltip.textContent = text;
        this.dom.tooltip.style.left = `${x + 15}px`;
        this.dom.tooltip.style.top = `${y + 15}px`;
        this.dom.tooltip.style.display = 'block';
        this.dom.tooltip.classList.remove('d-none', 'hidden');
    }

    /**
     * Hides the floating hover tooltip.
     */
    hideTooltip() {
        if (this.dom.tooltip) {
            this.dom.tooltip.style.display = 'none';
            this.dom.tooltip.classList.add('d-none', 'hidden');
        }
    }

    /**
     * Shows or hides the Help & Navigation modal dialog.
     *
     * @param {boolean} [show=true] - True to show, false to hide.
     */
    showHelpModal(show = true) {
        if (!this.dom.helpModal) return;
        if (show) {
            this.dom.helpModal.style.display = 'flex';
            this.dom.helpModal.classList.remove('d-none', 'hidden');
        } else {
            this.dom.helpModal.style.display = 'none';
            this.dom.helpModal.classList.add('d-none', 'hidden');
        }
    }

    /**
     * Shows or hides the loading progress overlay.
     *
     * @param {boolean} [show=true] - True to show, false to hide.
     */
    showLoadingOverlay(show = true) {
        if (!this.dom.loadingOverlay) return;
        if (show) {
            this.dom.loadingOverlay.style.display = 'flex';
            this.dom.loadingOverlay.classList.remove('d-none', 'hidden');
        } else {
            this.dom.loadingOverlay.style.display = 'none';
            this.dom.loadingOverlay.classList.add('d-none', 'hidden');
        }
    }

    /**
     * Updates the Camera JSON textarea value with the current camera matrix.
     *
     * @param {string} camJsonStr - Serialized JSON matrix string.
     */
    updateCamJSONTextarea(camJsonStr) {
        if (this.dom.camJsonTextarea) {
            this.dom.camJsonTextarea.value = camJsonStr;
        }
    }

    /**
     * Copies the current Camera JSON text to the system clipboard.
     */
    copyCamJSON() {
        if (!this.dom.camJsonTextarea) return;
        this.dom.camJsonTextarea.select();
        navigator.clipboard.writeText(this.dom.camJsonTextarea.value)
            .then(() => {
                if (this.dom.camJsonCopyBtn) {
                    const orig = this.dom.camJsonCopyBtn.textContent;
                    this.dom.camJsonCopyBtn.textContent = 'Kopiert!';
                    setTimeout(() => {
                        this.dom.camJsonCopyBtn.textContent = orig;
                    }, 1500);
                }
            })
            .catch(err => {
                console.warn('Clipboard copy failed:', err);
            });
    }

    /**
     * Toggles fullscreen display mode for the viewer container.
     */
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            (this.container.requestFullscreen || this.container.webkitRequestFullscreen || this.container.msRequestFullscreen).call(this.container);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
        }
    }
}
