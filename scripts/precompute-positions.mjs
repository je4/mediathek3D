/**
 * Precomputes 3D box positions and orientation quaternions from kistendata.json
 * and writes the optimized result to kistenpositions.json.
 *
 * Usage:
 *   node scripts/precompute-positions.mjs [--input <path>] [--output <path>]
 *   npm run precompute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SplineCalculator } from '../pkg/web/static/js/modules/spline-calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse CLI arguments
const args = process.argv.slice(2);
let inputPath = path.join(rootDir, 'pkg/web/static/data/kistendata.json');
let outputPath = path.join(rootDir, 'pkg/web/static/data/kistenpositions.json');

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
        inputPath = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--output' && args[i + 1]) {
        outputPath = path.resolve(process.cwd(), args[++i]);
    }
}

function round(val, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
}

export function generateBoxPositions(kistenData, options = {}) {
    const pixelFactor = options.pixelFactor || 4;
    const floorSize = options.floorSize || (2048 * pixelFactor);
    const boxWidth = options.boxWidth || (55 * pixelFactor);
    const boxHeight = options.boxHeight || (20 * pixelFactor);
    const boxDepth = options.boxDepth || (30 * pixelFactor);
    const boxThick = options.boxThick || (2 * pixelFactor);
    const boxDistance = options.boxDistance !== undefined ? options.boxDistance : 0;

    const splineCalc = new SplineCalculator({
        pixelFactor,
        floorSize,
        boxWidth,
        boxHeight,
        boxDepth,
        boxThick,
        boxDistance
    });

    const boxes = [];
    const shelfMap = {};
    let totalBoxesCount = 0;

    for (const shelfKey of Object.keys(kistenData)) {
        const shelf = kistenData[shelfKey];
        if (!shelf.point || shelf.point.length === 0) continue;

        const spline = splineCalc.createCurveFromPoints(shelf.point);
        if (!spline) continue;

        shelfMap[shelfKey] = {
            name: shelf.name || shelfKey,
            area: shelf.area || '',
            aside: shelf.aside || 'right',
            levels: {}
        };

        for (const levelKey of Object.keys(shelf.level || {})) {
            const levelData = shelf.level[levelKey];
            const totalBoxes = parseInt(levelData.boxes, 10) || 0;
            const indent = parseFloat(levelData.indent) || 0;
            const levelNum = parseInt(levelKey, 10) || 1;

            if (totalBoxes <= 0) continue;

            const levelTransforms = splineCalc.calculateLevelTransforms(spline, totalBoxes, indent, levelNum);
            const levelBoxes = [];

            for (let counter = 0; counter < totalBoxes; counter++) {
                const num1 = counter + 1;
                const numStr1 = (num1 < 10 ? '0' : '') + num1;
                const baseName = `${shelfKey}${levelKey}${numStr1}`;
                const boxname1 = `${baseName}a`;
                const boxname2 = `${baseName}b`;

                const transform = levelTransforms[counter] || splineCalc.calculateBoxTransform(spline, counter, indent, levelNum);

                const boxItem = {
                    id: boxname1,
                    id2: boxname2,
                    name: baseName,
                    shelf: shelfKey,
                    level: levelNum,
                    index: num1,
                    index2: num1,
                    area: shelf.area || '',
                    aside: shelf.aside || 'right',
                    totalInLvl: totalBoxes,
                    position: [
                        round(transform.position.x, 2),
                        round(transform.position.y, 2),
                        round(transform.position.z, 2)
                    ],
                    quaternion: [
                        round(transform.quaternion.x, 5),
                        round(transform.quaternion.y, 5),
                        round(transform.quaternion.z, 5),
                        round(transform.quaternion.w, 5)
                    ]
                };

                boxes.push(boxItem);
                levelBoxes.push(boxItem);
                totalBoxesCount++;
            }

            shelfMap[shelfKey].levels[levelKey] = levelBoxes;
        }
    }

    return {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        pixelFactor,
        boxWidth,
        boxHeight,
        boxDepth,
        boxThick,
        boxDistance,
        totalShelves: Object.keys(shelfMap).length,
        totalBoxes: totalBoxesCount,
        shelves: shelfMap,
        boxes
    };
}

// Execute if run directly via CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    try {
        console.log(`[INFO] Reading shelf definitions from: ${inputPath}`);
        const raw = fs.readFileSync(inputPath, 'utf8');
        const kistenData = JSON.parse(raw);

        const startTime = performance.now();
        const result = generateBoxPositions(kistenData);
        const duration = (performance.now() - startTime).toFixed(2);

        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
        console.log(`[SUCCESS] Precomputed ${result.totalBoxes} box locations across ${result.totalShelves} shelves in ${duration}ms`);
        console.log(`[SUCCESS] Written to: ${outputPath}`);
    } catch (err) {
        console.error(`[ERROR] Failed to precompute box positions:`, err);
        process.exit(1);
    }
}
