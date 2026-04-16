import type { Point, ArcSegment, EdgeData } from "./edge-detection";

export interface FittedCircle {
  cx: number;
  cy: number;
  r: number;
  fitError: number;
  arcCoverage: number; // what fraction of the circle's circumference this arc covers (0-1)
  arcLength: number;
  arcPoints: Point[];
  type: "fitted";
}

export interface IdealCircle {
  cx: number;
  cy: number;
  r: number;
  originalR: number;
  fibIndex: number;
  type: "ideal";
}

export interface GridLine {
  x1: number; y1: number; x2: number; y2: number;
  type: "diagonal" | "baseline" | "vertical" | "thirds" | "construction";
}

export interface GridRect {
  x: number; y: number; width: number; height: number;
  type: "golden-rect" | "bounding";
}

export interface GridData {
  fittedCircles: FittedCircle[];
  idealCircles: IdealCircle[];
  goldenRects: GridRect[];
  thirdLines: GridLine[];
  diagonalLines: GridLine[];
  baselineLines: GridLine[];
  verticalLines: GridLine[];
  constructionLines: GridLine[];
  scores: {
    goldenRatio: number;
    symmetry: number;
    gridAlignment: number;
  };
}

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const PHI = (1 + Math.sqrt(5)) / 2;

// Kasa least-squares circle fit
function kasaCircleFit(points: Point[]): { cx: number; cy: number; r: number; error: number } | null {
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

  let sumR = 0;
  for (const p of points) {
    sumR += Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
  }
  const r = sumR / n;

  // Fit error: RMS distance from circle
  let errorSum = 0;
  for (const p of points) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    errorSum += (d - r) ** 2;
  }
  const error = Math.sqrt(errorSum / n);

  if (r <= 0 || !isFinite(cx) || !isFinite(cy) || !isFinite(r)) return null;
  return { cx, cy, r, error };
}

function snapToFibonacci(r: number, baseUnit: number): { snappedR: number; fibIdx: number } {
  let bestDist = Infinity, bestR = r, bestIdx = 0;
  for (let i = 0; i < FIBONACCI.length; i++) {
    const fibR = FIBONACCI[i] * baseUnit;
    const dist = Math.abs(r - fibR);
    if (dist < bestDist) { bestDist = dist; bestR = fibR; bestIdx = i; }
  }
  return { snappedR: bestR, fibIdx: bestIdx };
}

// Merge circles that trace the same curve (similar center + radius)
function mergeCircles(circles: FittedCircle[], mergeThreshold: number): FittedCircle[] {
  const merged: FittedCircle[] = [];
  const used = new Set<number>();

  for (let i = 0; i < circles.length; i++) {
    if (used.has(i)) continue;

    let best = circles[i];
    // Find all circles similar to this one
    for (let j = i + 1; j < circles.length; j++) {
      if (used.has(j)) continue;
      const ci = circles[i], cj = circles[j];
      const centerDist = Math.sqrt((ci.cx - cj.cx) ** 2 + (ci.cy - cj.cy) ** 2);
      const radiusDiff = Math.abs(ci.r - cj.r);

      if (centerDist < mergeThreshold && radiusDiff < mergeThreshold * 0.5) {
        used.add(j);
        // Keep the one with longer arc (more evidence)
        if (cj.arcLength > best.arcLength) {
          best = cj;
        }
      }
    }
    merged.push(best);
  }
  return merged;
}

export function generateGrid(edgeData: EdgeData, canvasWidth: number, canvasHeight: number): GridData {
  const { arcs, bounds, centerOfMass, edgePoints, logoSize } = edgeData;

  // Maximum fit error: tighter tolerance = circles must closely trace curves
  const maxFitError = logoSize * 0.025;
  // Minimum radius: at least 3% of logo size
  const minRadius = logoSize * 0.03;
  // Maximum radius: no bigger than the logo itself
  const maxRadius = logoSize * 1.2;
  // Minimum arc coverage: circle must cover at least 10% of its circumference
  const minArcCoverage = 0.10;

  // Fit circles to each arc
  let fittedCircles: FittedCircle[] = [];

  for (const arc of arcs) {
    const fit = kasaCircleFit(arc.points);
    if (!fit) continue;
    if (fit.error > maxFitError) continue;
    if (fit.r < minRadius || fit.r > maxRadius) continue;

    // Arc coverage: what fraction of the circle does this arc span?
    const circumference = 2 * Math.PI * fit.r;
    const coverage = arc.arcLength / circumference;
    if (coverage < minArcCoverage) continue;

    // Verify the fit: check that most arc points are actually close to the circle
    let closePoints = 0;
    for (const p of arc.points) {
      const d = Math.abs(Math.sqrt((p.x - fit.cx) ** 2 + (p.y - fit.cy) ** 2) - fit.r);
      if (d < maxFitError * 1.5) closePoints++;
    }
    const closeRatio = closePoints / arc.points.length;
    if (closeRatio < 0.7) continue; // 70% of points must be close to the circle

    fittedCircles.push({
      cx: fit.cx,
      cy: fit.cy,
      r: fit.r,
      fitError: fit.error,
      arcCoverage: coverage,
      arcLength: arc.arcLength,
      arcPoints: arc.points,
      type: "fitted",
    });
  }

  // Score: prioritize circles with long arcs and good fit
  // Score = arcLength * arcCoverage / (1 + fitError)
  fittedCircles.sort((a, b) => {
    const scoreA = a.arcLength * a.arcCoverage / (1 + a.fitError);
    const scoreB = b.arcLength * b.arcCoverage / (1 + b.fitError);
    return scoreB - scoreA;
  });

  // Merge similar circles (same curve detected from adjacent contour segments)
  const mergeThreshold = logoSize * 0.06;
  fittedCircles = mergeCircles(fittedCircles, mergeThreshold);

  // Keep only the best circles — fewer is better for a clean grid
  fittedCircles = fittedCircles.slice(0, 10);

  // Compute Fibonacci base unit
  const radii = fittedCircles.map(c => c.r).sort((a, b) => a - b);
  let bestBaseUnit = logoSize / 21;
  let bestBaseError = Infinity;

  if (radii.length > 0) {
    for (const fib of FIBONACCI) {
      if (fib === 0) continue;
      const candidateBase = radii[0] / fib; // try smallest radius as reference
      if (candidateBase <= 0) continue;
      let totalError = 0;
      for (const r of radii) {
        const { snappedR } = snapToFibonacci(r, candidateBase);
        totalError += Math.abs(r - snappedR) / r;
      }
      if (totalError < bestBaseError) {
        bestBaseError = totalError;
        bestBaseUnit = candidateBase;
      }
    }
    // Also try median radius
    const medR = radii[Math.floor(radii.length / 2)];
    for (const fib of FIBONACCI) {
      if (fib === 0) continue;
      const candidateBase = medR / fib;
      if (candidateBase <= 0) continue;
      let totalError = 0;
      for (const r of radii) {
        const { snappedR } = snapToFibonacci(r, candidateBase);
        totalError += Math.abs(r - snappedR) / r;
      }
      if (totalError < bestBaseError) {
        bestBaseError = totalError;
        bestBaseUnit = candidateBase;
      }
    }
  }

  // Ideal circles
  const idealCircles: IdealCircle[] = fittedCircles.map(fc => {
    const { snappedR, fibIdx } = snapToFibonacci(fc.r, bestBaseUnit);
    return { cx: fc.cx, cy: fc.cy, r: snappedR, originalR: fc.r, fibIndex: fibIdx, type: "ideal" };
  });

  // Construction lines between circle centers (only nearby circles)
  const constructionLines: GridLine[] = [];
  for (let i = 0; i < Math.min(fittedCircles.length, 8); i++) {
    for (let j = i + 1; j < Math.min(fittedCircles.length, 8); j++) {
      const a = fittedCircles[i], b = fittedCircles[j];
      const dist = Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
      if (dist < logoSize && dist > logoSize * 0.05) {
        constructionLines.push({ x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy, type: "construction" });
      }
    }
  }

  // Standard geometric grids
  const lx = bounds.x, ly = bounds.y;
  const cx = centerOfMass.x, cy = centerOfMass.y;

  const goldenRects: GridRect[] = [
    { x: lx, y: ly, width: bounds.width, height: bounds.height, type: "bounding" },
    { x: lx, y: ly, width: bounds.width / PHI, height: bounds.height, type: "golden-rect" },
    { x: lx + bounds.width / PHI, y: ly, width: bounds.width - bounds.width / PHI, height: bounds.height, type: "golden-rect" },
    { x: lx, y: ly, width: bounds.width, height: bounds.height / PHI, type: "golden-rect" },
  ];

  const thirdLines: GridLine[] = [];
  for (let i = 1; i <= 2; i++) {
    thirdLines.push({ x1: lx + (bounds.width * i) / 3, y1: ly, x2: lx + (bounds.width * i) / 3, y2: ly + bounds.height, type: "thirds" });
    thirdLines.push({ x1: lx, y1: ly + (bounds.height * i) / 3, x2: lx + bounds.width, y2: ly + (bounds.height * i) / 3, type: "thirds" });
  }

  const diagonalLines: GridLine[] = [
    { x1: lx, y1: ly, x2: lx + bounds.width, y2: ly + bounds.height, type: "diagonal" },
    { x1: lx + bounds.width, y1: ly, x2: lx, y2: ly + bounds.height, type: "diagonal" },
    { x1: cx, y1: ly, x2: cx, y2: ly + bounds.height, type: "diagonal" },
    { x1: lx, y1: cy, x2: lx + bounds.width, y2: cy, type: "diagonal" },
  ];

  const baselineLines: GridLine[] = [];
  const baseStep = bounds.height / 8;
  for (let i = 1; i < 8; i++) {
    baselineLines.push({ x1: lx, y1: ly + baseStep * i, x2: lx + bounds.width, y2: ly + baseStep * i, type: "baseline" });
  }

  const verticalLines: GridLine[] = [];
  const vertStep = bounds.width / 8;
  for (let i = 1; i < 8; i++) {
    verticalLines.push({ x1: lx + vertStep * i, y1: ly, x2: lx + vertStep * i, y2: ly + bounds.height, type: "vertical" });
  }

  // Scores
  const tolerance = logoSize * 0.025;

  // Golden ratio: how close fitted radii are to their Fibonacci-snapped versions
  let goldenScore = 0;
  if (fittedCircles.length > 0) {
    let totalRatio = 0;
    for (let i = 0; i < fittedCircles.length; i++) {
      const actual = fittedCircles[i].r;
      const ideal = idealCircles[i].r;
      totalRatio += 1 - Math.abs(actual - ideal) / Math.max(actual, ideal);
    }
    goldenScore = Math.min(100, Math.round((totalRatio / fittedCircles.length) * 100));
  }

  // Symmetry
  let symHits = 0;
  for (const p of edgePoints) {
    const mirrorX = 2 * cx - p.x;
    if (edgePoints.some(q => Math.abs(q.x - mirrorX) < tolerance && Math.abs(q.y - p.y) < tolerance)) {
      symHits++;
    }
  }
  const symmetryScore = edgePoints.length > 0 ? Math.min(100, Math.round((symHits / edgePoints.length) * 100)) : 0;

  // Grid alignment: how many edge points are near a fitted circle arc
  let alignHits = 0;
  for (const p of edgePoints) {
    for (const c of fittedCircles) {
      const d = Math.abs(Math.sqrt((p.x - c.cx) ** 2 + (p.y - c.cy) ** 2) - c.r);
      if (d < tolerance) { alignHits++; break; }
    }
  }
  const gridAlignScore = edgePoints.length > 0 ? Math.min(100, Math.round((alignHits / edgePoints.length) * 100)) : 0;

  return {
    fittedCircles, idealCircles, goldenRects, thirdLines, diagonalLines, baselineLines, verticalLines, constructionLines,
    scores: { goldenRatio: goldenScore, symmetry: symmetryScore, gridAlignment: gridAlignScore },
  };
}
