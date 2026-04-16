import type { Point, ArcSegment, EdgeData } from "./edge-detection";

export interface FittedCircle {
  cx: number;
  cy: number;
  r: number;
  fitError: number; // mean distance of arc points to circle (lower = better)
  arcPoints: Point[];
  type: "fitted";
}

export interface IdealCircle {
  cx: number;
  cy: number;
  r: number;
  originalR: number;
  fibIndex: number; // which Fibonacci number this snapped to
  type: "ideal";
}

export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: "diagonal" | "baseline" | "vertical" | "thirds" | "construction";
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

// Kasa method: algebraic least-squares circle fit
// Minimizes sum of (x^2 + y^2 - 2*cx*x - 2*cy*y - (r^2 - cx^2 - cy^2))^2
function kasaCircleFit(points: Point[]): { cx: number; cy: number; r: number; error: number } | null {
  const n = points.length;
  if (n < 3) return null;

  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  let sumX3 = 0, sumY3 = 0, sumX2Y = 0, sumXY2 = 0;

  for (const p of points) {
    const x = p.x, y = p.y;
    sumX += x; sumY += y;
    sumX2 += x * x; sumY2 += y * y;
    sumXY += x * y;
    sumX3 += x * x * x; sumY3 += y * y * y;
    sumX2Y += x * x * y; sumXY2 += x * y * y;
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

  // Compute fit error: mean absolute distance from circle
  let errorSum = 0;
  for (const p of points) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    errorSum += Math.abs(d - r);
  }
  const error = errorSum / n;

  if (r <= 0 || !isFinite(cx) || !isFinite(cy) || !isFinite(r)) return null;

  return { cx, cy, r, error };
}

// Snap a radius to the nearest Fibonacci-ratio value
function snapToFibonacci(r: number, baseUnit: number): { snappedR: number; fibIdx: number } {
  let bestDist = Infinity;
  let bestR = r;
  let bestIdx = 0;

  for (let i = 0; i < FIBONACCI.length; i++) {
    const fibR = FIBONACCI[i] * baseUnit;
    const dist = Math.abs(r - fibR);
    if (dist < bestDist) {
      bestDist = dist;
      bestR = fibR;
      bestIdx = i;
    }
  }
  return { snappedR: bestR, fibIdx: bestIdx };
}

// Deduplicate similar circles (overlapping center + similar radius)
function deduplicateCircles(circles: FittedCircle[], tolerance: number): FittedCircle[] {
  const result: FittedCircle[] = [];
  for (const c of circles) {
    const isDuplicate = result.some(
      (existing) =>
        Math.sqrt((existing.cx - c.cx) ** 2 + (existing.cy - c.cy) ** 2) < tolerance &&
        Math.abs(existing.r - c.r) < tolerance
    );
    if (!isDuplicate) {
      result.push(c);
    }
  }
  return result;
}

export function generateGrid(edgeData: EdgeData, canvasWidth: number, canvasHeight: number): GridData {
  const { arcs, bounds, centerOfMass, edgePoints } = edgeData;
  const logoSize = Math.max(bounds.width, bounds.height);
  const maxFitError = logoSize * 0.04; // circles must fit within 4% of logo size
  const dedupeThreshold = logoSize * 0.05;

  // Step 1: Fit circles to each arc segment using Kasa method
  let fittedCircles: FittedCircle[] = [];

  for (const arc of arcs) {
    const fit = kasaCircleFit(arc.points);
    if (!fit) continue;
    if (fit.error > maxFitError) continue;
    if (fit.r < logoSize * 0.02) continue; // too tiny
    if (fit.r > logoSize * 3) continue; // too huge

    fittedCircles.push({
      cx: fit.cx,
      cy: fit.cy,
      r: fit.r,
      fitError: fit.error,
      arcPoints: arc.points,
      type: "fitted",
    });
  }

  // Sort by fit quality (lowest error first)
  fittedCircles.sort((a, b) => a.fitError - b.fitError);

  // Deduplicate overlapping circles
  fittedCircles = deduplicateCircles(fittedCircles, dedupeThreshold);

  // Keep top circles (don't clutter)
  fittedCircles = fittedCircles.slice(0, 15);

  // Step 2: Compute base unit for Fibonacci snapping
  // Use the median fitted radius as reference
  const radii = fittedCircles.map((c) => c.r).sort((a, b) => a - b);
  const medianR = radii.length > 0 ? radii[Math.floor(radii.length / 2)] : logoSize / 8;
  // Find base unit so that medianR ~= some Fibonacci number * baseUnit
  let bestBaseUnit = medianR / 8; // default to fib(8)=21... no, fib index 5=8
  let bestBaseError = Infinity;
  for (const fib of FIBONACCI) {
    if (fib === 0) continue;
    const candidateBase = medianR / fib;
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

  // Step 3: Create ideal circles (Fibonacci-snapped versions)
  const idealCircles: IdealCircle[] = fittedCircles.map((fc) => {
    const { snappedR, fibIdx } = snapToFibonacci(fc.r, bestBaseUnit);
    return {
      cx: fc.cx,
      cy: fc.cy,
      r: snappedR,
      originalR: fc.r,
      fibIndex: fibIdx,
      type: "ideal",
    };
  });

  // Step 4: Construction lines connecting circle centers
  const constructionLines: GridLine[] = [];
  for (let i = 0; i < fittedCircles.length && i < 8; i++) {
    for (let j = i + 1; j < fittedCircles.length && j < 8; j++) {
      const a = fittedCircles[i];
      const b = fittedCircles[j];
      const dist = Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
      // Only connect circles that are close enough to be related
      if (dist < logoSize * 1.5) {
        constructionLines.push({
          x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy, type: "construction",
        });
      }
    }
  }

  // Step 5: Standard geometric grids (aligned to bounds)
  const lx = bounds.x;
  const ly = bounds.y;

  // Golden rectangle
  const goldenRects: GridRect[] = [];
  goldenRects.push({ x: lx, y: ly, width: bounds.width, height: bounds.height, type: "bounding" });
  const subW = bounds.width / PHI;
  goldenRects.push({ x: lx, y: ly, width: subW, height: bounds.height, type: "golden-rect" });
  goldenRects.push({ x: lx + subW, y: ly, width: bounds.width - subW, height: bounds.height, type: "golden-rect" });
  const subH = bounds.height / PHI;
  goldenRects.push({ x: lx, y: ly, width: bounds.width, height: subH, type: "golden-rect" });

  // Rule of thirds
  const thirdLines: GridLine[] = [];
  for (let i = 1; i <= 2; i++) {
    thirdLines.push({ x1: lx + (bounds.width * i) / 3, y1: ly, x2: lx + (bounds.width * i) / 3, y2: ly + bounds.height, type: "thirds" });
    thirdLines.push({ x1: lx, y1: ly + (bounds.height * i) / 3, x2: lx + bounds.width, y2: ly + (bounds.height * i) / 3, type: "thirds" });
  }

  // Diagonals
  const cx = centerOfMass.x;
  const cy = centerOfMass.y;
  const diagonalLines: GridLine[] = [
    { x1: lx, y1: ly, x2: lx + bounds.width, y2: ly + bounds.height, type: "diagonal" },
    { x1: lx + bounds.width, y1: ly, x2: lx, y2: ly + bounds.height, type: "diagonal" },
    { x1: cx, y1: ly, x2: cx, y2: ly + bounds.height, type: "diagonal" },
    { x1: lx, y1: cy, x2: lx + bounds.width, y2: cy, type: "diagonal" },
  ];

  // Baseline
  const baselineLines: GridLine[] = [];
  const baseStep = bounds.height / 8;
  for (let i = 1; i < 8; i++) {
    baselineLines.push({ x1: lx, y1: ly + baseStep * i, x2: lx + bounds.width, y2: ly + baseStep * i, type: "baseline" });
  }

  // Vertical rhythm
  const verticalLines: GridLine[] = [];
  const vertStep = bounds.width / 8;
  for (let i = 1; i < 8; i++) {
    verticalLines.push({ x1: lx + vertStep * i, y1: ly, x2: lx + vertStep * i, y2: ly + bounds.height, type: "vertical" });
  }

  // Step 6: Scores
  const tolerance = logoSize * 0.03;

  // Golden ratio score: how well fitted circles match their Fibonacci-snapped versions
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
    const hasMatch = edgePoints.some(
      (q) => Math.abs(q.x - mirrorX) < tolerance && Math.abs(q.y - p.y) < tolerance
    );
    if (hasMatch) symHits++;
  }
  const symmetryScore = edgePoints.length > 0 ? Math.min(100, Math.round((symHits / edgePoints.length) * 100)) : 0;

  // Grid alignment: how many edge points fall near circle arcs
  let alignHits = 0;
  for (const p of edgePoints) {
    for (const c of fittedCircles) {
      const d = Math.abs(Math.sqrt((p.x - c.cx) ** 2 + (p.y - c.cy) ** 2) - c.r);
      if (d < tolerance) { alignHits++; break; }
    }
  }
  const gridAlignScore = edgePoints.length > 0 ? Math.min(100, Math.round((alignHits / edgePoints.length) * 100)) : 0;

  return {
    fittedCircles,
    idealCircles,
    goldenRects,
    thirdLines,
    diagonalLines,
    baselineLines,
    verticalLines,
    constructionLines,
    scores: {
      goldenRatio: goldenScore,
      symmetry: symmetryScore,
      gridAlignment: gridAlignScore,
    },
  };
}
