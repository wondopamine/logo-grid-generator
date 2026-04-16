/**
 * Smart Grid: sliding-window circle fitting with explanation-power ranking.
 *
 * Instead of splitting contours at curvature breaks (which creates tiny fragments),
 * we slide a fitting window along each contour, find ALL possible circles, then
 * greedily select the set that explains the most edge pixels with minimal overlap.
 */

import type { Point, Contour, EdgeData } from "./edge-detection";

export interface SmartCircle {
  cx: number;
  cy: number;
  r: number;
  fitError: number;
  /** Which edge points this circle "explains" (within tolerance of the circle) */
  explainedCount: number;
  /** The arc points this circle was fitted from */
  arcPoints: Point[];
  /** What fraction of the circle's circumference the arc covers */
  arcCoverage: number;
  label?: string;
}

export interface SmartGridResult {
  circles: SmartCircle[];
  /** For each edge point index, the index of the circle that explains it (-1 if none) */
  assignment: Int32Array;
  /** Deviation: for each edge point, distance to nearest assigned circle */
  deviations: Float32Array;
  /** Percentage of edge points explained */
  coveragePercent: number;
}

// Kasa least-squares circle fit
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

function chainLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.sqrt((points[i].x - points[i - 1].x) ** 2 + (points[i].y - points[i - 1].y) ** 2);
  }
  return len;
}

/**
 * Slide a fitting window along a contour and collect all candidate circles.
 * Window sizes: try multiple (small for tight curves, large for sweeping arcs).
 */
function slidingWindowFit(
  contour: Contour,
  windowSizes: number[],
  maxError: number,
  minRadius: number,
  maxRadius: number,
): SmartCircle[] {
  const pts = contour.points;
  const candidates: SmartCircle[] = [];

  for (const winSize of windowSizes) {
    if (pts.length < winSize) continue;
    const step = Math.max(1, Math.floor(winSize / 3)); // 2/3 overlap between windows

    for (let start = 0; start + winSize <= pts.length; start += step) {
      const window = pts.slice(start, start + winSize);
      const fit = kasaFit(window);
      if (!fit) continue;
      if (fit.r < minRadius || fit.r > maxRadius) continue;

      // Relative error: fitError / radius should be small
      const relError = fit.error / fit.r;
      if (relError > 0.15) continue; // 15% relative error max
      if (fit.error > maxError) continue;

      const arcLen = chainLength(window);
      const circumference = 2 * Math.PI * fit.r;
      const coverage = arcLen / circumference;

      // Must cover at least 5% of circumference
      if (coverage < 0.05) continue;

      candidates.push({
        cx: fit.cx,
        cy: fit.cy,
        r: fit.r,
        fitError: fit.error,
        explainedCount: 0,
        arcPoints: window,
        arcCoverage: coverage,
      });
    }
  }

  return candidates;
}

/**
 * Greedy set cover: select circles that collectively explain the most edge points
 * with minimal redundancy.
 */
function greedySelect(
  candidates: SmartCircle[],
  edgePoints: Point[],
  tolerance: number,
  maxCircles: number,
): { selected: SmartCircle[]; assignment: Int32Array; deviations: Float32Array } {
  const n = edgePoints.length;
  const explained = new Uint8Array(n); // 1 if this point is explained by a selected circle
  const assignment = new Int32Array(n).fill(-1);
  const deviations = new Float32Array(n).fill(Infinity);
  const selected: SmartCircle[] = [];

  // Pre-compute: for each candidate, which edge points it explains
  const candidateExplanations: number[][] = candidates.map((c) => {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = Math.abs(Math.sqrt((edgePoints[i].x - c.cx) ** 2 + (edgePoints[i].y - c.cy) ** 2) - c.r);
      if (d < tolerance) indices.push(i);
    }
    return indices;
  });

  // Greedy: pick the candidate that explains the most UNEXPLAINED points
  for (let round = 0; round < maxCircles; round++) {
    let bestIdx = -1;
    let bestNewCount = 0;

    for (let ci = 0; ci < candidates.length; ci++) {
      let newCount = 0;
      for (const pi of candidateExplanations[ci]) {
        if (!explained[pi]) newCount++;
      }
      if (newCount > bestNewCount) {
        bestNewCount = newCount;
        bestIdx = ci;
      }
    }

    if (bestIdx < 0 || bestNewCount < 3) break; // No candidate explains enough new points

    const chosen = candidates[bestIdx];
    chosen.explainedCount = bestNewCount;
    selected.push(chosen);

    // Mark points as explained
    const circleIdx = selected.length - 1;
    for (const pi of candidateExplanations[bestIdx]) {
      explained[pi] = 1;
      const d = Math.abs(Math.sqrt((edgePoints[pi].x - chosen.cx) ** 2 + (edgePoints[pi].y - chosen.cy) ** 2) - chosen.r);
      if (d < deviations[pi]) {
        deviations[pi] = d;
        assignment[pi] = circleIdx;
      }
    }

    // Remove this candidate so it can't be picked again
    candidateExplanations[bestIdx] = [];
  }

  // Fill deviations for unassigned points (find nearest circle)
  for (let i = 0; i < n; i++) {
    if (assignment[i] >= 0) continue;
    let bestDist = Infinity;
    let bestCircle = -1;
    for (let ci = 0; ci < selected.length; ci++) {
      const c = selected[ci];
      const d = Math.abs(Math.sqrt((edgePoints[i].x - c.cx) ** 2 + (edgePoints[i].y - c.cy) ** 2) - c.r);
      if (d < bestDist) { bestDist = d; bestCircle = ci; }
    }
    deviations[i] = bestDist;
    assignment[i] = bestCircle;
  }

  return { selected, assignment, deviations };
}

/**
 * Main smart grid analysis.
 */
export function analyzeSmartGrid(edgeData: EdgeData): SmartGridResult {
  const { contours, edgePoints, logoSize, bounds } = edgeData;
  const tolerance = logoSize * 0.03;
  const maxError = logoSize * 0.06;
  const minRadius = logoSize * 0.02;
  const maxRadius = logoSize * 1.5;

  // Window sizes: scaled to logo size
  // Small windows catch tight curves (corner radii, spiral center)
  // Medium windows catch letterform arcs
  // Large windows catch the squircle boundary and sweeping strokes
  const baseWin = Math.max(10, Math.floor(logoSize / 30));
  const windowSizes = [
    Math.floor(baseWin * 0.5),  // tight curves
    baseWin,                     // medium arcs
    Math.floor(baseWin * 2),    // large arcs
    Math.floor(baseWin * 4),    // sweeping contours
  ].filter(w => w >= 6);

  // Collect candidates from all contours
  let allCandidates: SmartCircle[] = [];
  for (const contour of contours) {
    const candidates = slidingWindowFit(contour, windowSizes, maxError, minRadius, maxRadius);
    allCandidates.push(...candidates);
  }

  // Greedy selection: pick circles that explain the most edge points
  const maxCircles = 20;
  const { selected, assignment, deviations } = greedySelect(allCandidates, edgePoints, tolerance, maxCircles);

  // Coverage stats
  let explainedTotal = 0;
  for (let i = 0; i < edgePoints.length; i++) {
    if (deviations[i] < tolerance) explainedTotal++;
  }
  const coveragePercent = edgePoints.length > 0 ? Math.round((explainedTotal / edgePoints.length) * 100) : 0;

  return {
    circles: selected,
    assignment,
    deviations,
    coveragePercent,
  };
}

/**
 * Compute a full deviation map (pixel-level) for the entire image.
 * For each pixel that's on an edge, stores the distance to the nearest smart circle.
 * Non-edge pixels get Infinity.
 */
export function computeDeviationMap(
  edgePoints: Point[],
  circles: SmartCircle[],
  width: number,
  height: number,
): Float32Array {
  const map = new Float32Array(width * height).fill(-1); // -1 = not an edge

  for (const p of edgePoints) {
    const idx = Math.round(p.y) * width + Math.round(p.x);
    if (idx < 0 || idx >= width * height) continue;

    let bestDist = Infinity;
    for (const c of circles) {
      const d = Math.abs(Math.sqrt((p.x - c.cx) ** 2 + (p.y - c.cy) ** 2) - c.r);
      if (d < bestDist) bestDist = d;
    }
    map[idx] = bestDist;
  }

  return map;
}
