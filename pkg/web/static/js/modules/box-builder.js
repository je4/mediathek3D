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
    }

    /**
     * Dynamically updates PBR material colors and emissive properties according to an active theme.
     *
     * @param {Object} theme - Theme configuration object.
     * @param {number} [theme.boxColor] - Main shelf box color (hex).
     * @param {number} [theme.bottomColor] - Base shelf floor plate color (hex).
     * @param {number} [theme.boxColorHighlight] - Box selection highlight color (hex).
     * @param {number} [theme.emissiveHighlight] - Selection glow color (hex).
     * @param {number} [theme.emissiveIntensity] - Glow intensity.
     */
    setTheme(theme = {}) {
        if (theme.boxColor !== undefined) {
            this.boxColor = theme.boxColor;
            this.materialBox.color.setHex(this.boxColor);
        }
        if (theme.bottomColor !== undefined) {
            this.bottomColor = theme.bottomColor;
            this.materialBottom.color.setHex(this.bottomColor);
        }
        if (theme.boxColorHighlight !== undefined) {
            this.boxColorHighlight = theme.boxColorHighlight;
            this.materialBoxHighlight.color.setHex(this.boxColorHighlight);
        }
        if (theme.emissiveHighlight !== undefined) {
            this.materialBoxHighlight.emissive.setHex(theme.emissiveHighlight);
        }
        if (theme.emissiveIntensity !== undefined) {
            this.materialBoxHighlight.emissiveIntensity = theme.emissiveIntensity;
        }
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
     * Renders text labels for both sides onto an offscreen 2D canvas and returns a Three.js CanvasTexture.
     *
     * @param {string} text1 - Label text for side 1 (e.g. "A101").
     * @param {string} [text2=''] - Optional label text for opposite side 2 (e.g. "A107").
     * @param {string} [aside='right'] - Orientation side ('right' or 'left').
     * @param {string} [textColor='#1a1a1a'] - CSS color string for text fill.
     * @returns {THREE.CanvasTexture} Texture ready for use on MeshBasicMaterial.
     */
    createLabelTexture(text1, text2 = '', aside = 'right', textColor = "#1a1a1a") {
        const canvas = document.createElement('canvas');
        canvas.width = nearestPow2(this.boxWidth - 2 * this.boxThick);
        canvas.height = nearestPow2(this.boxDepth);

        const ctx = canvas.getContext('2d');
        ctx.font = `600 ${5.5 * this.pixelFactor}px "Inter", "Roboto", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = textColor;

        if (aside === 'right') {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }

        const textY = canvas.height - Math.round(5 * this.pixelFactor);

        // Side 1 text at front opening
        ctx.fillText(`    ${text1}`, 4 * this.pixelFactor, textY);

        // Side 2 text at opposite opening (facing outward from opposite side)
        const secondText = text2 || text1;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        ctx.fillText(`    ${secondText}`, 4 * this.pixelFactor, textY);
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    /**
     * Creates an individual 3D box mesh instance with dynamically rendered text labels on both sides.
     *
     * @param {string} fullname - Primary box identifier (e.g. "A101").
     * @param {Object} [shelfData={}] - Shelf metadata (aside, area, etc.).
     * @param {string} [fullname2=''] - Opposite side box identifier (e.g. "A107").
     * @returns {THREE.Object3D} Instantiated box mesh with label and userData.
     */
    createBox(fullname, shelfData = {}, fullname2 = '') {
        const shelfKey = fullname.charAt(0);
        const aside = shelfData.aside || 'right';
        const area = shelfData.area || '';
        const oppositeId = fullname2 || fullname;

        const box = this.boxTemplate.clone();
        box.name = fullname;

        // Render dynamic label texture on floor plane with both side labels
        const labelTexture = this.createLabelTexture(fullname, oppositeId, aside, "#1a1a1a");
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

        // Store metadata on box object for interactive raycasting, search and display
        box.userData = {
            id: fullname,
            id2: oppositeId,
            oppositeId: oppositeId,
            shelf: shelfKey,
            level: parseInt(fullname.charAt(1), 10) || 1,
            index: parseInt(fullname.substring(2), 10) || 1,
            index2: parseInt(oppositeId.substring(2), 10) || 1,
            aside: aside,
            area: area
        };

        return box;
    }

    /**
     * Creates a bottom plate placeholder mesh for level 1 when higher levels are filtered out.
     *
     * @param {string} fullname - Primary box identifier (e.g. "A101").
     * @param {Object} [shelfData={}] - Shelf metadata.
     * @param {string} [fullname2=''] - Opposite side box identifier (e.g. "A107").
     * @returns {THREE.Object3D} Instantiated bottom plate mesh with label and userData.
     */
    createBottom(fullname, shelfData = {}, fullname2 = '') {
        const shelfKey = fullname.charAt(0);
        const aside = shelfData.aside || 'right';
        const oppositeId = fullname2 || fullname;

        const box = this.bottomTemplate.clone();
        box.name = fullname;

        const labelTexture = this.createLabelTexture(fullname, oppositeId, aside, "#ffffff");
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
            id2: oppositeId,
            oppositeId: oppositeId,
            shelf: shelfKey,
            level: parseInt(fullname.charAt(1), 10) || 1,
            index: parseInt(fullname.substring(2), 10) || 1,
            index2: parseInt(oppositeId.substring(2), 10) || 1,
            aside: aside,
            area: shelfData.area || ''
        };

        return box;
    }
}
