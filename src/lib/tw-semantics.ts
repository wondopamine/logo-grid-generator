/**
 * TW Semantic Layer
 *
 * Detects specific TW-logo features (squircle corners, spiral eye, t/w bridge)
 * and produces a TweakPlan that the warp engine can use to apply 3× weighted
 * displacements in those regions.
 *
 * Works by extracting semantic regions already computed by edge-detection.ts
 * (cornerRegions, spiralEye, innerContours) and fitting idealized circles.
 */

import type { GridData } from "./grid-generator";
import type { TWStructure } from "./use-logo-store";

interface Point {
  x: number;
  y: number;
}

// Kasa least-squares fit (same as grid-generator)
function kasaFit(points: Point[]): { cx: number; cy: number; r: number; error: number } | null {
  const n = points.length;
  if (n < 3) return null;

  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  let sumX3 = 0, sumY3 = 0, sumX2Y = 0, sumXY2 = 0;

  for (const p of points) {
    sumX += p.x; sumY += p.y;
    sumX2 += p.x * p.x; sumY2 += p.y * p.y;
    sumXY += p.x * p.y;
    sumX3 += p.x ** 3; sumY3 += p.y ** 3;
    sumX2Y += p.x * p.x * p.y; sumXY2 += p.x * p.y * p.y;
  }

  const A = n * sumX2 - sumX * sumX;
  const B = n * sumXY - sumX * sumY;
  const C = n * sumY2 - sumY * sumY;
  const D = 0.5 * (n * sumX3 + n * sumXY2 - sumX * sumX2 - sumX * sumY2);
  const E = 0.5 * (n * sumX2Y + n * sumY3 - sumY * sumX2 - sumY * sumY2);

  const denom = A * C - B * B;
  if (Math.abs(denom) < 1e-10) return null;

  const cx = (D * C - B * E) / denom;
  const cy = (A * E - B * D) / denom;

  let sumR = 0, errorSum = 0;
  for (const p of points) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    sumR += d;
  }
  const r = sumR / n;
  for (const p of points) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    errorSum += (d - r) ** 2;
  }

  if (r <= 0 || !isFinite(cx) || !isFinite(cy)) return null;
  return { cx, cy, r, error: Math.sqrt(errorSum / n) };
}

/**
 * Detect the semantic structure of a TW-style logo from the computed grid data
 * and raw image.
 *
 * Reuses grid-generator's `cornerRadiusCircles` (which already fits the outer
 * contour's corner regions via Kasa + enforces equal radius across found
 * corners) and its spiral-eye output. The previous implementation re-derived
 * corners from `fittedCircles`, which are letterform-curve fits — wrong pool
 * for the squircle boundary, so it found nothing for TW-style logos.
 *
 * Bridge detection still uses fittedCircles because the t/w junction IS a
 * letterform feature, so fittedCircles is the right pool there.
 */
export function detectTWStructure(gridData: GridData, imageData: ImageData): TWStructure {
  const structure: TWStructure = {
    squircleCorners: [],
    spiralEye: null,
    bridge: null,
    outerSquircle: null,
  };

  const bounds = computeAlphaBounds(imageData);

  // (a) Squircle corners — reuse grid-generator's equalized corner-radius
  //     circles. Derive quadrant from position relative to bounds center.
  if (bounds) {
    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;

    const cornerCircles = gridData.cornerRadiusCircles.filter(c => c.label !== "Spiral eye");

    for (const c of cornerCircles) {
      const west = c.cx < midX;
      const north = c.cy < midY;
      const quadrant: "NW" | "NE" | "SE" | "SW" =
        west && north ? "NW" :
        !west && north ? "NE" :
        !west && !north ? "SE" : "SW";

      structure.squircleCorners.push({
        quadrant,
        cx: c.cx,
        cy: c.cy,
        r: c.r,
        originalR: c.r,
      });
    }

    if (structure.squircleCorners.length >= 2) {
      structure.outerSquircle = {
        cx: midX,
        cy: midY,
        r: Math.max(bounds.width, bounds.height) / 2,
      };
    }
  }

  // (b) Spiral eye — prefer grid-generator's spiral-eye circle (labeled on
  //     cornerRadiusCircles). Fall back to the distance-transform search if
  //     grid-generator didn't emit one.
  const preSpiral = gridData.cornerRadiusCircles.find(c => c.label === "Spiral eye");
  if (preSpiral) {
    structure.spiralEye = { cx: preSpiral.cx, cy: preSpiral.cy, r: preSpiral.r };
  } else {
    const eye = findSpiralEye(imageData, bounds);
    if (eye) structure.spiralEye = eye;
  }

  // (c) Tangent bridge — fittedCircles is the right pool here (letterform arcs).
  if (bounds && gridData.fittedCircles.length >= 2) {
    structure.bridge = findBridge(gridData.fittedCircles, bounds);
  }

  return structure;
}

function computeAlphaBounds(imageData: ImageData): { x: number; y: number; width: number; height: number } | null {
  const { width, height, data } = imageData;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }
  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function findSpiralEye(
  imageData: ImageData,
  bounds: { x: number; y: number; width: number; height: number } | null
): { cx: number; cy: number; r: number } | null {
  if (!bounds) return null;
  const { width, height, data } = imageData;
  const step = Math.max(2, Math.floor(Math.min(bounds.width, bounds.height) / 60));
  let bestX = 0, bestY = 0, bestDist = 0;

  for (let y = bounds.y + step; y < bounds.y + bounds.height - step; y += step) {
    for (let x = bounds.x + step; x < bounds.x + bounds.width - step; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      const brightness = (r + g + b) / 3;
      // Only inside the white letterform
      if (a < 128 || brightness < 200) continue;

      // Find min distance to nearest non-white pixel via ray casting
      let minEdgeDist = Infinity;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        for (let d = 1; d < Math.max(bounds.width, bounds.height) / 2; d += 2) {
          const px = Math.round(x + Math.cos(angle) * d);
          const py = Math.round(y + Math.sin(angle) * d);
          if (px < 0 || px >= width || py < 0 || py >= height) {
            minEdgeDist = Math.min(minEdgeDist, d);
            break;
          }
          const pi = (py * width + px) * 4;
          const pa = data[pi + 3];
          const pb = (data[pi] + data[pi + 1] + data[pi + 2]) / 3;
          if (pa < 128 || pb < 180) {
            minEdgeDist = Math.min(minEdgeDist, d);
            break;
          }
        }
      }

      if (minEdgeDist > bestDist && minEdgeDist !== Infinity) {
        bestDist = minEdgeDist;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestDist < 3) return null;
  return { cx: bestX, cy: bestY, r: bestDist };
}

function findBridge(
  circles: GridData["fittedCircles"],
  bounds: { x: number; y: number; width: number; height: number }
): TWStructure["bridge"] {
  // Look for pairs of arc endpoints that are close to each other AND in the lower half
  const lowerThreshold = bounds.y + bounds.height * 0.45;

  let bestPair: {
    p1: Point;
    p2: Point;
    dist: number;
    r: number;
  } | null = null;

  for (let i = 0; i < circles.length; i++) {
    const ci = circles[i];
    if (ci.arcPoints.length < 2) continue;
    const endPointsI = [ci.arcPoints[0], ci.arcPoints[ci.arcPoints.length - 1]];

    for (let j = i + 1; j < circles.length; j++) {
      const cj = circles[j];
      if (cj.arcPoints.length < 2) continue;
      const endPointsJ = [cj.arcPoints[0], cj.arcPoints[cj.arcPoints.length - 1]];

      for (const pi of endPointsI) {
        if (pi.y < lowerThreshold) continue;
        for (const pj of endPointsJ) {
          if (pj.y < lowerThreshold) continue;
          const d = Math.sqrt((pi.x - pj.x) ** 2 + (pi.y - pj.y) ** 2);
          if (d > 3 && d < Math.min(bounds.width, bounds.height) * 0.2) {
            if (!bestPair || d < bestPair.dist) {
              bestPair = { p1: pi, p2: pj, dist: d, r: d / 2 };
            }
          }
        }
      }
    }
  }

  if (!bestPair) return null;
  return {
    p1: bestPair.p1,
    p2: bestPair.p2,
    cx: (bestPair.p1.x + bestPair.p2.x) / 2,
    cy: (bestPair.p1.y + bestPair.p2.y) / 2,
    r: bestPair.r,
  };
}
