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
     * @param {number} [options.boxColor=0xe0e0e0] - Default box body color.
     * @param {number} [options.bottomColor=0x283744] - Base level / shelf bottom color.
     * @param {number} [options.boxColorHighlight=0xff0909] - Highlight color for selected boxes.
     */
    constructor(options = {}) {
        this.pixelFactor = options.pixelFactor || 4;

        this.boxWidth = options.boxWidth || (55 * this.pixelFactor);
        this.boxHeight = options.boxHeight || (20 * this.pixelFactor);
        this.boxDepth = options.boxDepth || (30 * this.pixelFactor);
        this.boxThick = options.boxThick || (2 * this.pixelFactor);

        this.boxColor = options.boxColor !== undefined ? options.boxColor : 0xe0e0e0;
        this.bottomColor = options.bottomColor !== undefined ? options.bottomColor : 0x283744;
        this.boxColorHighlight = options.boxColorHighlight !== undefined ? options.boxColorHighlight : 0xff0909;

        // Shared materials
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

        // Pre-built reusable template geometries
        this.boxTemplate = this._createBoxTemplate();
        this.bottomTemplate = this._createBottomTemplate();
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
        boxBottom.name = "bottom";
        template.add(boxBottom);

        // Top wall
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
        boxBottom.name = "bottom";
        template.add(boxBottom);
        return template;
    }

    /**
     * Renders a text label onto an offscreen 2D canvas and returns a Three.js CanvasTexture.
     *
     * @param {string} text - Label text (e.g. "A101").
     * @param {string} [aside='right'] - Orientation side ('right' or 'left').
     * @param {string} [textColor='#000000'] - CSS color string for text fill.
     * @returns {THREE.CanvasTexture} Texture ready for use on MeshBasicMaterial.
     */
    createLabelTexture(text, aside = 'right', textColor = "#000000") {
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
        const labelTexture = this.createLabelTexture(fullname, aside, "#000000");
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
