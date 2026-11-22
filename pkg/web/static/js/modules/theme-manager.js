/**
 * Mediathek3D Color Theme Manager Module.
 *
 * Defines and orchestrates architectural color palettes, PBR material properties,
 * Three.js scene background tones, and CSS custom property theme overrides.
 *
 * @module modules/theme-manager
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.3.0
 */

export const COLOR_THEMES = {
    'mediathek-dark': {
        id: 'mediathek-dark',
        name: 'Mediathek Dunkel',
        label: 'Mediathek Dunkel',
        description: 'Nord Polar Night & Frost Palette für Dark Mode',
        boxColor: 0xf4f5f7,
        bottomColor: 0x1e222a,
        boxColorHighlight: 0x88c0d0,
        emissiveHighlight: 0x1e3a47,
        emissiveIntensity: 0.45,
        backgroundColor: 0x2e3440,
        ui: {
            bgDark: '#2e3440',
            bgPanel: 'rgba(46, 52, 64, 0.88)',
            bgPanelHover: 'rgba(67, 76, 94, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#88c0d0',
            accentColor: '#88c0d0',
            accentHover: '#8fbcbb',
            textPrimary: '#eceff4',
            textSecondary: '#d8dee9',
            textMuted: '#e5e9f0'
        }
    },
    'mediathek-light': {
        id: 'mediathek-light',
        name: 'Mediathek Hell',
        label: 'Mediathek Hell',
        description: 'Nord Snow Storm Palette für Light Mode',
        boxColor: 0xffffff,
        bottomColor: 0xd8dee9,
        boxColorHighlight: 0x365a82,
        emissiveHighlight: 0x102538,
        emissiveIntensity: 0.35,
        backgroundColor: 0xe5e9f0,
        ui: {
            bgDark: '#e5e9f0',
            bgPanel: 'rgba(236, 239, 244, 0.92)',
            bgPanelHover: 'rgba(216, 222, 233, 0.98)',
            borderColor: 'rgba(46, 52, 64, 0.18)',
            borderFocus: '#365a82',
            accentColor: '#365a82',
            accentHover: '#465f7a',
            textPrimary: '#2e3440',
            textSecondary: '#4c566a',
            textMuted: '#707e94'
        }
    },
    'unibas-light': {
        id: 'unibas-light',
        name: 'Uni Basel Hell',
        label: 'Uni Basel Hell',
        description: 'Universität Basel Minze & Petrol',
        boxColor: 0xffffff,
        bottomColor: 0xd3e8e5,
        boxColorHighlight: 0x075d56,
        emissiveHighlight: 0x032b28,
        emissiveIntensity: 0.35,
        backgroundColor: 0xedf5f4,
        ui: {
            bgDark: '#edf5f4',
            bgPanel: 'rgba(255, 255, 255, 0.92)',
            bgPanelHover: 'rgba(237, 245, 244, 0.98)',
            borderColor: 'rgba(7, 93, 86, 0.2)',
            borderFocus: '#075d56',
            accentColor: '#075d56',
            accentHover: '#0c4946',
            textPrimary: '#2d373c',
            textSecondary: '#4a555a',
            textMuted: '#718087'
        }
    },
    'unibas-dark': {
        id: 'unibas-dark',
        name: 'Uni Basel Dunkel',
        label: 'Uni Basel Dunkel',
        description: 'Universität Basel Minze dunkel',
        boxColor: 0xffffff,
        bottomColor: 0x093b39,
        boxColorHighlight: 0xa5d7d2,
        emissiveHighlight: 0x052e2b,
        emissiveIntensity: 0.45,
        backgroundColor: 0x0c4946,
        ui: {
            bgDark: '#0c4946',
            bgPanel: 'rgba(17, 94, 89, 0.9)',
            bgPanelHover: 'rgba(12, 73, 70, 0.98)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#a5d7d2',
            accentColor: '#a5d7d2',
            accentHover: '#d7edeb',
            textPrimary: '#ffffff',
            textSecondary: '#d7edeb',
            textMuted: '#a5d7d2'
        }
    },
    'fhnw-light': {
        id: 'fhnw-light',
        name: 'FHNW Hell',
        label: 'FHNW Hell',
        description: 'FHNW Gelb & Hellgrau',
        boxColor: 0xffffff,
        bottomColor: 0xdedede,
        boxColorHighlight: 0xfde70e,
        emissiveHighlight: 0x4a4300,
        emissiveIntensity: 0.35,
        backgroundColor: 0xf2f2f2,
        ui: {
            bgDark: '#f2f2f2',
            bgPanel: 'rgba(255, 255, 255, 0.92)',
            bgPanelHover: 'rgba(242, 242, 242, 0.98)',
            borderColor: 'rgba(0, 0, 0, 0.15)',
            borderFocus: '#333333',
            accentColor: '#333333',
            accentHover: '#555555',
            textPrimary: '#111111',
            textSecondary: '#333333',
            textMuted: '#666666'
        }
    },
    'fhnw-dark': {
        id: 'fhnw-dark',
        name: 'FHNW Dunkel',
        label: 'FHNW Dunkel',
        description: 'FHNW Gelb & Anthrazit',
        boxColor: 0xf4f5f7,
        bottomColor: 0x242424,
        boxColorHighlight: 0xfde70e,
        emissiveHighlight: 0x4a4300,
        emissiveIntensity: 0.45,
        backgroundColor: 0x171717,
        ui: {
            bgDark: '#171717',
            bgPanel: 'rgba(36, 36, 36, 0.9)',
            bgPanelHover: 'rgba(56, 56, 56, 0.98)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#fde70e',
            accentColor: '#fde70e',
            accentHover: '#ffea2e',
            textPrimary: '#ffffff',
            textSecondary: '#dedede',
            textMuted: '#888888'
        }
    },
    ocher: {
        id: 'ocher',
        name: 'Ocker-Lounge',
        label: 'Ocker Lounge',
        description: 'Architektur-Farben & gelbe Lounge-Inseln der HGK-Mediathek',
        boxColor: 0xf4f5f7,
        bottomColor: 0x3a3d40,          // Warmes Grafit / Schiefer
        boxColorHighlight: 0xd4a017,    // Warmes Ockergelb / Senf
        emissiveHighlight: 0x423000,
        emissiveIntensity: 0.45,
        backgroundColor: 0x232629,      // Anthrazit Hintergrund
        ui: {
            bgDark: '#232629',
            bgPanel: 'rgba(35, 38, 41, 0.88)',
            bgPanelHover: 'rgba(48, 52, 56, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#e8b835',
            accentColor: '#d4a017',
            accentHover: '#e8b835',
            textPrimary: '#ffffff',
            textSecondary: '#d0d4d8',
            textMuted: '#8c939a'
        }
    },
    sage: {
        id: 'sage',
        name: 'Salbei-Natur',
        label: 'Salbei & Natur',
        description: 'Botanische Grüntöne & Schweizer Grafik',
        boxColor: 0xf4f5f7,
        bottomColor: 0x2f3833,          // Tiefes Waldschiefer
        boxColorHighlight: 0x2a8c5f,    // Sattes Salbei-/Smaragdgrün
        emissiveHighlight: 0x08331d,
        emissiveIntensity: 0.45,
        backgroundColor: 0x1c2420,      // Moos-Grafit Hintergrund
        ui: {
            bgDark: '#1c2420',
            bgPanel: 'rgba(28, 36, 32, 0.88)',
            bgPanelHover: 'rgba(38, 48, 43, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#3db57e',
            accentColor: '#2a8c5f',
            accentHover: '#3db57e',
            textPrimary: '#ffffff',
            textSecondary: '#c8d4cd',
            textMuted: '#7f9488'
        }
    },
    olive: {
        id: 'olive',
        name: 'Olivenhain',
        label: 'Olivenhain',
        description: 'Mediterrane Olivtöne, warmes Khaki & geölte Holzstrukturen',
        boxColor: 0xf4f5f7,
        bottomColor: 0x33362a,          // Warmes Oliv-Grafit / Umbra-Moos
        boxColorHighlight: 0x8ba336,    // Sattes warmes Olivgrün
        emissiveHighlight: 0x242e0a,
        emissiveIntensity: 0.45,
        backgroundColor: 0x1f231c,      // Dunkler Oliv-Anthrazit Hintergrund
        ui: {
            bgDark: '#1f231c',
            bgPanel: 'rgba(31, 35, 28, 0.88)',
            bgPanelHover: 'rgba(43, 49, 39, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#a5c040',
            accentColor: '#8ba336',
            accentHover: '#a5c040',
            textPrimary: '#ffffff',
            textSecondary: '#d2d7cc',
            textMuted: '#8c9680'
        }
    },
    terracotta: {
        id: 'terracotta',
        name: 'Warm Terrakotta',
        label: 'Warm Terrakotta',
        description: 'Warmes Mokka-Anthrazit & Terrakotta-Akzente',
        boxColor: 0xf4f5f7,
        bottomColor: 0x363230,          // Mokka-Anthrazit
        boxColorHighlight: 0xd96b43,    // Warmes Terrakotta / Rostorange
        emissiveHighlight: 0x3b1406,
        emissiveIntensity: 0.45,
        backgroundColor: 0x221e1d,      // Warmes Kaffeegrafit
        ui: {
            bgDark: '#221e1d',
            bgPanel: 'rgba(37, 32, 31, 0.88)',
            bgPanelHover: 'rgba(50, 44, 42, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#e87c55',
            accentColor: '#d96b43',
            accentHover: '#e87c55',
            textPrimary: '#ffffff',
            textSecondary: '#d8cfcc',
            textMuted: '#948783'
        }
    },
    classic: {
        id: 'classic',
        name: 'Klassisch (Blau/Rot)',
        label: 'Klassisch (Blau/Rot)',
        description: 'Originales technisches CAD-Signalrot & Blaugrau',
        boxColor: 0xf4f5f7,
        bottomColor: 0x283744,          // Blaugrau
        boxColorHighlight: 0xff2222,    // Signalrot
        emissiveHighlight: 0x440000,
        emissiveIntensity: 0.4,
        backgroundColor: 0x1e2630,      // Navy-Blaugrau
        ui: {
            bgDark: '#1e2630',
            bgPanel: 'rgba(30, 38, 48, 0.85)',
            bgPanelHover: 'rgba(40, 50, 64, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderFocus: '#4da3ff',
            accentColor: '#ff3344',
            accentHover: '#ff4d5e',
            textPrimary: '#ffffff',
            textSecondary: '#b0bec5',
            textMuted: '#78909c'
        }
    }
};

export const DEFAULT_THEME = 'ocher';

export class ThemeManager {
    /**
     * @param {Object} [options={}]
     * @param {string} [options.initialTheme='ocher']
     * @param {Object} [options.mediathek=null]
     * @param {Object} [options.mediathek3D=null]
     * @param {Object} [options.ui=null]
     * @param {Function} [options.onThemeChanged=null]
     */
    constructor(options = {}) {
        this.options = options;
        this.mediathek = options.mediathek || null;
        this.mediathek3D = options.mediathek3D || null;
        this.ui = options.ui || null;
        this.onThemeChanged = options.onThemeChanged || null;

        this.currentThemeId = this._resolveThemeId(options.initialTheme);
    }

    /**
     * Resolves a theme ID string or alias to a valid COLOR_THEMES key.
     * @private
     * @param {string} themeId
     * @returns {string}
     */
    _resolveThemeId(themeId) {
        if (!themeId) {
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem('rfid_theme') || localStorage.getItem('mediathek3d_theme');
                if (stored && COLOR_THEMES[stored]) return stored;
            }
            return DEFAULT_THEME;
        }
        const clean = themeId.toLowerCase().trim();
        if (COLOR_THEMES[clean]) return clean;

        // Aliases / keywords
        if (clean.includes('mediathek-light') || clean.includes('nord-light')) return 'mediathek-light';
        if (clean.includes('mediathek-dark') || clean.includes('nord-dark') || clean === 'mediathek') return 'mediathek-dark';
        if (clean.includes('unibas-light') || (clean.includes('unibas') && clean.includes('light'))) return 'unibas-light';
        if (clean.includes('unibas-dark') || clean === 'unibas') return 'unibas-dark';
        if (clean.includes('fhnw-light') || (clean.includes('fhnw') && clean.includes('light'))) return 'fhnw-light';
        if (clean.includes('fhnw-dark') || clean === 'fhnw') return 'fhnw-dark';
        if (clean.includes('ocker') || clean.includes('ocher') || clean.includes('yellow') || clean.includes('lounge')) return 'ocher';
        if (clean.includes('olive') || clean.includes('olivenhain') || clean.includes('khaki')) return 'olive';
        if (clean.includes('salbei') || clean.includes('sage') || clean.includes('green') || clean.includes('natur')) return 'sage';
        if (clean.includes('terra') || clean.includes('orange') || clean.includes('mokka') || clean.includes('warm')) return 'terracotta';
        if (clean.includes('classic') || clean.includes('klassisch') || clean.includes('red') || clean.includes('blue')) return 'classic';

        return DEFAULT_THEME;
    }

    /**
     * Gets the current theme configuration object.
     * @returns {Object}
     */
    getCurrentTheme() {
        return COLOR_THEMES[this.currentThemeId] || COLOR_THEMES[DEFAULT_THEME];
    }

    /**
     * Sets and applies a theme by ID.
     *
     * @param {string} themeId
     * @param {boolean} [persist=true] - Whether to save to localStorage
     * @returns {Object} The applied theme configuration
     */
    setTheme(themeId, persist = true) {
        const resolvedId = this._resolveThemeId(themeId);
        this.currentThemeId = resolvedId;
        const theme = COLOR_THEMES[resolvedId];

        // 1. Update CSS Custom Properties on document root
        this.applyThemeCSS(theme);

        // 2. Update Three.js scene background color if mediathek core is ready
        if (this.mediathek && typeof this.mediathek.setBackgroundColor === 'function') {
            this.mediathek.setBackgroundColor(theme.backgroundColor);
        }

        // 3. Update PBR materials on Mediathek3D box builder
        if (this.mediathek3D) {
            this.mediathek3D.setTheme(theme);
        }

        // 4. Update UI select element if present
        if (this.ui && this.ui.dom && this.ui.dom.themeSelect) {
            this.ui.dom.themeSelect.value = resolvedId;
        }

        // 5. Persist choice in browser localStorage and cookies
        if (persist && typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('mediathek3d_theme', resolvedId);
                localStorage.setItem('rfid_theme', resolvedId);
                if (typeof document !== 'undefined') {
                    document.cookie = `rfid_theme=${encodeURIComponent(resolvedId)};path=/;max-age=31536000`;
                }
            } catch (e) {
                // Ignore localStorage errors
            }
        }

        if (typeof this.onThemeChanged === 'function') {
            this.onThemeChanged(theme);
        }

        return theme;
    }

    /**
     * Cycles to the next available theme in round-robin order.
     * @returns {Object} The new theme configuration
     */
    cycleTheme() {
        const keys = Object.keys(COLOR_THEMES);
        const currentIndex = keys.indexOf(this.currentThemeId);
        const nextIndex = (currentIndex + 1) % keys.length;
        const nextId = keys[nextIndex];
        return this.setTheme(nextId, true);
    }

    /**
     * Applies theme CSS custom properties to the document root element.
     * @param {Object} theme
     */
    applyThemeCSS(theme) {
        if (!theme || !theme.ui || typeof document === 'undefined') return;
        const root = document.documentElement;

        root.style.setProperty('--bg-dark', theme.ui.bgDark);
        root.style.setProperty('--bg-panel', theme.ui.bgPanel);
        root.style.setProperty('--bg-panel-hover', theme.ui.bgPanelHover);
        root.style.setProperty('--border-color', theme.ui.borderColor);
        root.style.setProperty('--border-focus', theme.ui.borderFocus);
        root.style.setProperty('--accent-color', theme.ui.accentColor);
        root.style.setProperty('--accent-hover', theme.ui.accentHover);
        root.style.setProperty('--text-primary', theme.ui.textPrimary);
        root.style.setProperty('--text-secondary', theme.ui.textSecondary);
        root.style.setProperty('--text-muted', theme.ui.textMuted);
        root.setAttribute('data-theme', theme.id);
    }

    /**
     * Binds or updates references to 3D and UI instances once initialized.
     * @param {Object} references
     * @param {Object} [references.mediathek]
     * @param {Object} [references.mediathek3D]
     * @param {Object} [references.ui]
     */
    attach(references = {}) {
        if (references.mediathek) this.mediathek = references.mediathek;
        if (references.mediathek3D) this.mediathek3D = references.mediathek3D;
        if (references.ui) this.ui = references.ui;

        // Re-apply to the newly attached instances
        this.setTheme(this.currentThemeId, false);
    }
}
