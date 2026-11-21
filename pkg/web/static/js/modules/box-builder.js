/**
 * Mediathek3D Box & Shelf Mesh Builder Module.
 *
 * Handles the construction of open-sided shelf box geometries, bottom level plates,
 * dynamic offscreen 2D canvas text labels, and Three.js CanvasTextures.
 *
 * @module modules/box-builder
 * @author Mediathek Team / modernized for Go Templates
 * @version 2.2.0
 */

import * as THREE from 'three';
import { nearestPow2 } from './math.js';

export class BoxBuilder {
    /**
     * Initializes the BoxBuilder with dimensional parameters and default materials.
     *
     * @param {Object} options - Builder configuration settings.
     * @param {number} [options.pixelFactor=4] - Resolution multiplier for mesh and texture sharpness.
     * @param {number} [options.boxWidth=220] - Outer width of each box.
     * @param {number} [options.boxHeight=80] - Outer height of each box.
     * @param {number} [options.boxDepth=120] - Depth of each box.
     * @param {number} [options.boxThick=8] - Wall thickness.
     * @param {number} [options.boxColor=0xf4f5f7] - Default box body color.
     * @param {number} [options.bottomColor=0x283744] - Base level / shelf bottom color.
     * @param {number} [options.boxColorHighlight=0xff2222] - Highlight color for selected boxes.
     * @param {boolean} [options.showBooks=true] - Whether to generate procedural book fillings.
     */
    constructor(options = {}) {
        this.pixelFactor = options.pixelFactor || 4;

        this.boxWidth = options.boxWidth || (55 * this.pixelFactor);
        this.boxHeight = options.boxHeight || (20 * this.pixelFactor);
        this.boxDepth = options.boxDepth || (30 * this.pixelFactor);
        this.boxThick = options.boxThick || (2 * this.pixelFactor);

        this.boxColor = options.boxColor !== undefined ? options.boxColor : 0xf4f5f7;
        this.bottomColor = options.bottomColor !== undefined ? options.bottomColor : 0x283744;
        this.boxColorHighlight = options.boxColorHighlight !== undefined ? options.boxColorHighlight : 0xff2222;
        this.showBooks = options.showBooks !== undefined ? options.showBooks : true;

        // Shared realistic PBR materials
        this.materialBox = new THREE.MeshStandardMaterial({
            color: this.boxColor,
            roughness: 0.35,
            metalness: 0.04
        });
        this.materialBottom = new THREE.MeshStandardMaterial({
            color: this.bottomColor,
            roughness: 0.5,
            metalness: 0.08
        });
        this.materialBoxHighlight = new THREE.MeshStandardMaterial({
            color: this.boxColorHighlight,
            roughness: 0.25,
            metalness: 0.05,
            emissive: 0x440000,
            emissiveIntensity: 0.4
        });

        // Pre-built reusable template geometries
        this.boxTemplate = this._createBoxTemplate();
        this.bottomTemplate = this._createBottomTemplate();
        this.bookTemplates = this._createBookTemplates();
    }

    /**
     * Constructs the base open box template geometry (bottom, top, left, right walls).
     *
     * @private
     * @returns {THREE.Object3D} Container containing the 4 box wall meshes.
     */
    _createBoxTemplate() {
        const template = new THREE.Object3D();
        const mat = this.materialBox;

        // Bottom wall
        const gBottom = new THREE.BoxGeometry(this.boxDepth, this.boxWidth, this.boxThick);
        const boxBottom = new THREE.Mesh(gBottom, mat);
        boxBottom.position.set(0, 0, 0);
        boxBottom.castShadow = true;
        boxBottom.receiveShadow = true;
        boxBottom.name = "bottom";
        template.add(boxBottom);

        // Top wall
        const boxTop = new THREE.Mesh(gBottom, mat);
        boxTop.position.set(0, 0, this.boxHeight - this.boxThick);
        boxTop.castShadow = true;
        boxTop.receiveShadow = true;
        boxTop.name = "top";
        template.add(boxTop);

        // Left wall
        const gWall = new THREE.BoxGeometry(this.boxDepth, this.boxThick, this.boxHeight - 2 * this.boxThick);
        const boxLeft = new THREE.Mesh(gWall, mat);
        boxLeft.position.set(0, -(this.boxWidth - this.boxThick) / 2, (this.boxHeight - this.boxThick) / 2);
        boxLeft.castShadow = true;
        boxLeft.receiveShadow = true;
        boxLeft.name = "left";
        template.add(boxLeft);

        // Right wall
        const boxRight = new THREE.Mesh(gWall, mat);
        boxRight.position.set(0, (this.boxWidth - this.boxThick) / 2, (this.boxHeight - this.boxThick) / 2);
        boxRight.castShadow = true;
        boxRight.receiveShadow = true;
        boxRight.name = "right";
        template.add(boxRight);

        return template;
    }

    /**
     * Constructs base shelf floor plate template geometry for level 1 placeholders.
     *
     * @private
     * @returns {THREE.Object3D} Container with floor plate mesh.
     */
    _createBottomTemplate() {
        const template = new THREE.Object3D();
        const g = new THREE.BoxGeometry(this.boxDepth, this.boxWidth, this.boxThick);
        const boxBottom = new THREE.Mesh(g, this.materialBottom);
        boxBottom.position.set(0, 0, 0);
        boxBottom.castShadow = true;
        boxBottom.receiveShadow = true;
        boxBottom.name = "bottom";
        template.add(boxBottom);
        return template;
    }

    /**
     * Constructs reusable template book cluster geometries to place inside shelf boxes.
     * @private
     * @returns {Array<THREE.Object3D>}
     */
    _createBookTemplates() {
        const templates = [];
        const palette = [
            0x224263, // Navy Blue
            0x882834, // Crimson Red
            0x2b523e, // Emerald Green
            0xb85628, // Terracotta
            0xcf9832, // Ochre
            0x2f343b, // Charcoal
            0x296470, // Teal
            0xeee8dc, // Cream / Paper
            0x522c4a, // Plum
            0x46576d, // Slate Blue
            0xf8f7f4  // Off-White
        ];

        const materials = palette.map(color => new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.45,
            metalness: 0.05
        }));

        const innerWidth = this.boxWidth - 2 * this.boxThick;
        const innerHeight = this.boxHeight - 2 * this.boxThick;
        const maxDepth = this.boxDepth * 0.72;
        const baseY = -innerWidth / 2;

        const createBook = (w, h, d, yPos, xOffset, matIdx) => {
            const geom = new THREE.BoxGeometry(d, w, h);
            const mesh = new THREE.Mesh(geom, materials[matIdx % materials.length]);
            mesh.name = "book";
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.set(xOffset, yPos, this.boxThick / 2 + h / 2);
            return mesh;
        };

        // Variation 0: Full shelf row (8 books of varied height & thickness)
        const t0 = new THREE.Object3D();
        t0.name = "books_cluster";
        let curY0 = baseY + 4 * this.pixelFactor;
        const books0 = [
            { w: 3.5, h: 0.75, d: 0.78, mat: 0 },
            { w: 4.2, h: 0.85, d: 0.82, mat: 1 },
            { w: 2.8, h: 0.65, d: 0.72, mat: 7 },
            { w: 5.0, h: 0.90, d: 0.85, mat: 2 },
            { w: 3.0, h: 0.70, d: 0.74, mat: 3 },
            { w: 4.5, h: 0.82, d: 0.80, mat: 5 },
            { w: 3.8, h: 0.88, d: 0.83, mat: 4 },
            { w: 4.0, h: 0.72, d: 0.75, mat: 6 }
        ];
        for (const b of books0) {
            const bw = b.w * this.pixelFactor;
            const bh = b.h * innerHeight;
            const bd = b.d * maxDepth;
            const y = curY0 + bw / 2;
            t0.add(createBook(bw, bh, bd, y, -1 * this.pixelFactor, b.mat));
            curY0 += bw + 1.2 * this.pixelFactor;
        }
        templates.push(t0);

        // Variation 1: Medium row with binders / tall books on left
        const t1 = new THREE.Object3D();
        t1.name = "books_cluster";
        let curY1 = baseY + 4 * this.pixelFactor;
        const books1 = [
            { w: 5.5, h: 0.92, d: 0.85, mat: 0 },
            { w: 5.2, h: 0.90, d: 0.85, mat: 9 },
            { w: 3.0, h: 0.70, d: 0.75, mat: 4 },
            { w: 3.5, h: 0.75, d: 0.78, mat: 2 },
            { w: 4.0, h: 0.82, d: 0.80, mat: 1 },
            { w: 2.5, h: 0.60, d: 0.70, mat: 7 }
        ];
        for (const b of books1) {
            const bw = b.w * this.pixelFactor;
            const bh = b.h * innerHeight;
            const bd = b.d * maxDepth;
            const y = curY1 + bw / 2;
            t1.add(createBook(bw, bh, bd, y, -1 * this.pixelFactor, b.mat));
            curY1 += bw + 1.2 * this.pixelFactor;
        }
        templates.push(t1);

        // Variation 2: Centered group with varied widths
        const t2 = new THREE.Object3D();
        t2.name = "books_cluster";
        let curY2 = baseY + 12 * this.pixelFactor;
        const books2 = [
            { w: 4.0, h: 0.80, d: 0.80, mat: 2 },
            { w: 3.2, h: 0.85, d: 0.82, mat: 3 },
            { w: 4.8, h: 0.72, d: 0.76, mat: 5 },
            { w: 3.0, h: 0.68, d: 0.70, mat: 0 },
            { w: 4.2, h: 0.88, d: 0.84, mat: 1 },
            { w: 3.6, h: 0.78, d: 0.77, mat: 6 }
        ];
        for (const b of books2) {
            const bw = b.w * this.pixelFactor;
            const bh = b.h * innerHeight;
            const bd = b.d * maxDepth;
            const y = curY2 + bw / 2;
            t2.add(createBook(bw, bh, bd, y, -1 * this.pixelFactor, b.mat));
            curY2 += bw + 1.2 * this.pixelFactor;
        }
        templates.push(t2);

        // Variation 3: Right-aligned monographs
        const t3 = new THREE.Object3D();
        t3.name = "books_cluster";
        let curY3 = 0;
        const books3 = [
            { w: 4.2, h: 0.85, d: 0.82, mat: 4 },
            { w: 5.0, h: 0.92, d: 0.86, mat: 7 },
            { w: 3.5, h: 0.76, d: 0.78, mat: 8 },
            { w: 3.8, h: 0.82, d: 0.80, mat: 0 },
            { w: 4.5, h: 0.70, d: 0.74, mat: 2 }
        ];
        for (const b of books3) {
            const bw = b.w * this.pixelFactor;
            const bh = b.h * innerHeight;
            const bd = b.d * maxDepth;
            const y = curY3 + bw / 2;
            t3.add(createBook(bw, bh, bd, y, -1 * this.pixelFactor, b.mat));
            curY3 += bw + 1.2 * this.pixelFactor;
        }
        templates.push(t3);

        return templates;
    }

    /**
     * Renders a text label onto an offscreen 2D canvas and returns a Three.js CanvasTexture.
     *
     * @param {string} text - Label text (e.g. "A101").
     * @param {string} [aside='right'] - Orientation side ('right' or 'left').
     * @param {string} [textColor='#000000'] - CSS color string for text fill.
     * @returns {THREE.CanvasTexture} Texture ready for use on MeshBasicMaterial.
     */
    createLabelTexture(text, aside = 'right', textColor = "#1a1a1a") {
        const canvas = document.createElement('canvas');
        canvas.width = nearestPow2(this.boxWidth - 2 * this.boxThick);
        canvas.height = nearestPow2(this.boxHeight);

        const ctx = canvas.getContext('2d');
        ctx.font = `600 ${5.5 * this.pixelFactor}px "Inter", "Roboto", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = textColor;

        if (aside === 'right') {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }

        ctx.fillText(`    ${text}`, 4 * this.pixelFactor, canvas.height - 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    /**
     * Creates an individual 3D box mesh instance with a dynamically rendered text label.
     *
     * @param {string} fullname - Box identifier (e.g. "A101").
     * @param {Object} [shelfData={}] - Shelf metadata (aside, area, etc.).
     * @returns {THREE.Object3D} Instantiated box mesh with label and userData.
     */
    createBox(fullname, shelfData = {}) {
        const shelfKey = fullname.charAt(0);
        const aside = shelfData.aside || 'right';
        const area = shelfData.area || '';

        const box = this.boxTemplate.clone();
        box.name = fullname;

        // Render dynamic label texture on front plane
        const labelTexture = this.createLabelTexture(fullname, aside, "#1a1a1a");
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
        labelMesh.position.set(0, 0, this.boxThick / 2 + 0.5);
        labelMesh.name = "label";
        box.add(labelMesh);

        // Deterministic book cluster assignment
        let hash = 0;
        for (let i = 0; i < fullname.length; i++) {
            hash = (hash * 31 + fullname.charCodeAt(i)) & 0xffffffff;
        }
        const variant = Math.abs(hash) % 5;
        if (variant < this.bookTemplates.length) {
            const books = this.bookTemplates[variant].clone();
            books.visible = this.showBooks;
            box.add(books);
        }

        // Store metadata on box object for interactive raycasting and search
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
     * Creates a bottom plate placeholder mesh for level 1 when higher levels are filtered out.
     *
     * @param {string} fullname - Box identifier (e.g. "A101").
     * @param {Object} [shelfData={}] - Shelf metadata.
     * @returns {THREE.Object3D} Instantiated bottom plate mesh with label and userData.
     */
    createBottom(fullname, shelfData = {}) {
        const shelfKey = fullname.charAt(0);
        const aside = shelfData.aside || 'right';

        const box = this.bottomTemplate.clone();
        box.name = fullname;

        const labelTexture = this.createLabelTexture(fullname, aside, "#ffffff");
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
}
