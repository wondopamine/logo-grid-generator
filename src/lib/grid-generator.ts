import type { Point, ArcSegment, EdgeData } from "./edge-detection";

export interface FittedCircle {
  cx: number;
  cy: number;
  r: number;
  fitError: number;
  arcCoverage: number;
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

export interface SimpleCircle {
  cx: number;
  cy: number;
  r: number;
  label?: string;
  type: "golden" | "concentric" | "bounding" | "inscribed" | "osculating" | "cornerRadius" | "tangent" | "keypoint";
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
  goldenCircles: SimpleCircle[];
  concentricCircles: SimpleCircle[];
  boundingCircles: SimpleCircle[];
  osculatingCircles: SimpleCircle[];
  cornerRadiusCircles: SimpleCircle[];
  tangentCircles: SimpleCircle[];
  keypointCircles: SimpleCircle[];
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

// ============================================================
// CIRCLE FITTING MATH
// ============================================================

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

  let errorSum = 0;
  for (const p of points) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    errorSum += (d - r) ** 2;
  }
  const error = Math.sqrt(errorSum / n);

  if (r <= 0 || !isFinite(cx) || !isFinite(cy) || !isFinite(r)) return null;
  return { cx, cy, r, error };
}

// Welzl's minimum bounding circle algorithm (randomized, expected O(n))
function minBoundingCircle(points: Point[]): SimpleCircle | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { cx: points[0].x, cy: points[0].y, r: 0, type: "bounding" };

  // Shuffle for expected linear time
  const pts = [...points];
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }

  function circleFrom2(p1: Point, p2: Point) {
    return {
      cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2,
      r: Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2) / 2,
    };
  }

  function circleFrom3(p1: Point, p2: Point, p3: Point) {
    const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return null;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { cx: ux, cy: uy, r: Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2) };
  }

  function isInside(c: { cx: number; cy: number; r: number }, p: Point) {
    return Math.sqrt((p.x - c.cx) ** 2 + (p.y - c.cy) ** 2) <= c.r + 1e-6;
  }

  let c = circleFrom2(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i++) {
    if (!isInside(c, pts[i])) {
      c = circleFrom2(pts[0], pts[i]);
      for (let j = 1; j < i; j++) {
        if (!isInside(c, pts[j])) {
          c = circleFrom2(pts[j], pts[i]);
          for (let k = 0; k < j; k++) {
            if (!isInside(c, pts[k])) {
              const c3 = circleFrom3(pts[k], pts[j], pts[i]);
              if (c3) c = c3;
            }
          }
        }
      }
    }
  }
  return { cx: c.cx, cy: c.cy, r: c.r, type: "bounding", label: "Bounding" };
}

// Maximum inscribed circle: largest circle fitting inside the logo alpha channel
// Uses distance transform approximation
function maxInscribedCircle(
  data: Uint8ClampedArray, width: number, height: number, bounds: { x: number; y: number; width: number; height: number }
): SimpleCircle | null {
  // Sample points inside the alpha mask and find the one farthest from any edge
  let bestX = bounds.x + bounds.width / 2;
  let bestY = bounds.y + bounds.height / 2;
  let bestDist = 0;

  const step = Math.max(2, Math.floor(Math.min(bounds.width, bounds.height) / 50));

  for (let y = bounds.y + step; y < bounds.y + bounds.height - step; y += step) {
    for (let x = bounds.x + step; x < bounds.x + bounds.width - step; x += step) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 128) continue;

      // Find distance to nearest transparent pixel (simplified: check in 8 directions)
      let minEdgeDist = Infinity;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        for (let d = 1; d < Math.max(bounds.width, bounds.height); d += step) {
          const px = Math.round(x + Math.cos(angle) * d);
          const py = Math.round(y + Math.sin(angle) * d);
          if (px < 0 || px >= width || py < 0 || py >= height) {
            minEdgeDist = Math.min(minEdgeDist, d);
            break;
          }
          const a = data[(py * width + px) * 4 + 3];
          if (a < 128) {
            minEdgeDist = Math.min(minEdgeDist, d);
            break;
          }
        }
      }

      if (minEdgeDist > bestDist) {
        bestDist = minEdgeDist;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestDist < 3) return null;
  return { cx: bestX, cy: bestY, r: bestDist, type: "inscribed", label: "Inscribed" };
}

// Osculating circles at curvature maxima
// The osculating circle at a point on a curve has radius = 1/curvature and is tangent to the curve
function osculatingCircles(arcs: ArcSegment[], minRadius: number, maxRadius: number): SimpleCircle[] {
  const circles: SimpleCircle[] = [];

  for (const arc of arcs) {
    const pts = arc.points;
    if (pts.length < 7) continue;

    const k = Math.max(2, Math.floor(pts.length / 10));

    // Find curvature at each point
    let maxCurvIdx = -1;
    let maxCurv = 0;

    for (let i = k; i < pts.length - k; i++) {
      const prev = pts[i - k], curr = pts[i], next = pts[i + k];
      const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
      const v2x = next.x - curr.x, v2y = next.y - curr.y;
      const cross = v1x * v2y - v1y * v2x;
      const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
      if (len1 < 0.5 || len2 < 0.5) continue;

      const curvature = Math.abs(cross) / (len1 * len2 * ((len1 + len2) / 2));
      if (curvature > maxCurv) {
        maxCurv = curvature;
        maxCurvIdx = i;
      }
    }

    if (maxCurvIdx < 0 || maxCurv < 1e-6) continue;

    // Osculating circle: radius = 1/curvature, centered along normal
    const r = 1 / maxCurv;
    if (r < minRadius || r > maxRadius) continue;

    const curr = pts[maxCurvIdx];
    const prev = pts[Math.max(0, maxCurvIdx - k)];
    const next = pts[Math.min(pts.length - 1, maxCurvIdx + k)];

    // Normal direction (perpendicular to tangent, toward center of curvature)
    const tx = next.x - prev.x, ty = next.y - prev.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    if (tLen < 0.5) continue;

    // Cross product sign determines which side the center is on
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const crossSign = v1x * v2y - v1y * v2x;
    const sign = crossSign > 0 ? 1 : -1;

    const nx = -ty / tLen * sign;
    const ny = tx / tLen * sign;

    circles.push({
      cx: curr.x + nx * r,
      cy: curr.y + ny * r,
      r,
      type: "osculating",
      label: `R=${Math.round(r)}`,
    });
  }

  return circles;
}

// Corner radius circles: at curvature discontinuities (where arc segments were split)
// These represent the actual turning radius at each corner of the logo
function cornerRadiusCircles(arcs: ArcSegment[], minRadius: number, maxRadius: number): SimpleCircle[] {
  const circles: SimpleCircle[] = [];

  for (const arc of arcs) {
    const pts = arc.points;
    if (pts.length < 5) continue;

    // Fit a circle to just the start and end regions of each arc (the corner zones)
    for (const region of [pts.slice(0, Math.min(8, Math.floor(pts.length / 3))), pts.slice(-Math.min(8, Math.floor(pts.length / 3)))]) {
      if (region.length < 3) continue;
      const fit = kasaCircleFit(region);
      if (!fit || fit.r < minRadius || fit.r > maxRadius || fit.error > fit.r * 0.3) continue;

      circles.push({
        cx: fit.cx, cy: fit.cy, r: fit.r,
        type: "cornerRadius",
        label: `r=${Math.round(fit.r)}`,
      });
    }
  }

  // Deduplicate
  const result: SimpleCircle[] = [];
  for (const c of circles) {
    const dup = result.some(e =>
      Math.sqrt((e.cx - c.cx) ** 2 + (e.cy - c.cy) ** 2) < c.r * 0.3 &&
      Math.abs(e.r - c.r) < c.r * 0.3
    );
    if (!dup) result.push(c);
  }
  return result;
}

// Tangent circles: circles tangent to pairs of existing fitted circles (Apollonius)
function tangentCirclePairs(fitted: FittedCircle[], minR: number, maxR: number): SimpleCircle[] {
  const circles: SimpleCircle[] = [];
  const limit = Math.min(fitted.length, 6);

  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      const a = fitted[i], b = fitted[j];
      const dist = Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
      if (dist < 1) continue;

      // External tangent circle: center lies on the line through both centers
      // at a distance such that it's tangent to both
      // For external tangency: r = (dist - a.r - b.r) / 2 positioned between them
      const gap = dist - a.r - b.r;
      if (gap > 0 && gap / 2 >= minR && gap / 2 <= maxR) {
        const t = (a.r + gap / 2) / dist;
        circles.push({
          cx: a.cx + (b.cx - a.cx) * t,
          cy: a.cy + (b.cy - a.cy) * t,
          r: gap / 2,
          type: "tangent",
          label: "Tangent",
        });
      }

      // Midpoint circle: centered at midpoint of the two centers with radius = half distance
      const midR = dist / 2;
      if (midR >= minR && midR <= maxR) {
        circles.push({
          cx: (a.cx + b.cx) / 2,
          cy: (a.cy + b.cy) / 2,
          r: midR,
          type: "tangent",
          label: "Mid",
        });
      }
    }
  }

  // Deduplicate
  const result: SimpleCircle[] = [];
  for (const c of circles) {
    if (!result.some(e => Math.sqrt((e.cx - c.cx) ** 2 + (e.cy - c.cy) ** 2) < e.r * 0.2 && Math.abs(e.r - c.r) < e.r * 0.2)) {
      result.push(c);
    }
  }
  return result.slice(0, 8);
}

// Circles through key intersection points (circumscribed through 3 points)
function keypointCircles(edgePoints: Point[], bounds: { x: number; y: number; width: number; height: number }, minR: number, maxR: number): SimpleCircle[] {
  const circles: SimpleCircle[] = [];

  // Use corner points of bounds + center as key points
  const keyPts: Point[] = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width / 2, y: bounds.y },
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height / 2 },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
  ];

  // Also add some edge points that are extremes
  if (edgePoints.length > 0) {
    const sorted = [...edgePoints];
    sorted.sort((a, b) => a.x - b.x);
    keyPts.push(sorted[0], sorted[sorted.length - 1]);
    sorted.sort((a, b) => a.y - b.y);
    keyPts.push(sorted[0], sorted[sorted.length - 1]);
  }

  // Generate circles through triplets of key points
  for (let i = 0; i < keyPts.length; i++) {
    for (let j = i + 1; j < keyPts.length; j++) {
      for (let k = j + 1; k < keyPts.length; k++) {
        const p1 = keyPts[i], p2 = keyPts[j], p3 = keyPts[k];
        const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
        if (Math.abs(d) < 1e-10) continue;

        const ux = ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) + (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) + (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) / d;
        const uy = ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) + (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) + (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) / d;
        const r = Math.sqrt((p1.x - ux) ** 2 + (p1.y - uy) ** 2);

        if (r >= minR && r <= maxR && isFinite(ux) && isFinite(uy)) {
          circles.push({ cx: ux, cy: uy, r, type: "keypoint" });
        }
      }
    }
  }

  // Deduplicate and keep best
  const result: SimpleCircle[] = [];
  for (const c of circles) {
    if (!result.some(e => Math.sqrt((e.cx - c.cx) ** 2 + (e.cy - c.cy) ** 2) < maxR * 0.1 && Math.abs(e.r - c.r) < maxR * 0.1)) {
      result.push(c);
    }
  }
  return result.slice(0, 6);
}

// ============================================================
// UTILITY
// ============================================================

function snapToFibonacci(r: number, baseUnit: number): { snappedR: number; fibIdx: number } {
  let bestDist = Infinity, bestR = r, bestIdx = 0;
  for (let i = 0; i < FIBONACCI.length; i++) {
    const fibR = FIBONACCI[i] * baseUnit;
    const dist = Math.abs(r - fibR);
    if (dist < bestDist) { bestDist = dist; bestR = fibR; bestIdx = i; }
  }
  return { snappedR: bestR, fibIdx: bestIdx };
}

function mergeCircles(circles: FittedCircle[], mergeThreshold: number): FittedCircle[] {
  const merged: FittedCircle[] = [];
  const used = new Set<number>();
  for (let i = 0; i < circles.length; i++) {
    if (used.has(i)) continue;
    let best = circles[i];
    for (let j = i + 1; j < circles.length; j++) {
      if (used.has(j)) continue;
      const ci = circles[i], cj = circles[j];
      if (Math.sqrt((ci.cx - cj.cx) ** 2 + (ci.cy - cj.cy) ** 2) < mergeThreshold && Math.abs(ci.r - cj.r) < mergeThreshold * 0.5) {
        used.add(j);
        if (cj.arcLength > best.arcLength) best = cj;
      }
    }
    merged.push(best);
  }
  return merged;
}

// ============================================================
// MAIN GENERATOR
// ============================================================

export function generateGrid(edgeData: EdgeData, canvasWidth: number, canvasHeight: number, imageData?: ImageData): GridData {
  const { arcs, bounds, centerOfMass, edgePoints, logoSize } = edgeData;

  const maxFitError = logoSize * 0.05;
  const minRadius = logoSize * 0.015;
  const maxRadius = logoSize * 1.5;
  const minArcCoverage = 0.05;

  // ---- Fitted circles (Kasa per arc) ----
  let fittedCircles: FittedCircle[] = [];
  for (const arc of arcs) {
    const fit = kasaCircleFit(arc.points);
    if (!fit) continue;
    if (fit.error > maxFitError || fit.r < minRadius || fit.r > maxRadius) continue;
    const circumference = 2 * Math.PI * fit.r;
    const coverage = arc.arcLength / circumference;
    if (coverage < minArcCoverage) continue;
    let closePoints = 0;
    for (const p of arc.points) {
      if (Math.abs(Math.sqrt((p.x - fit.cx) ** 2 + (p.y - fit.cy) ** 2) - fit.r) < maxFitError * 1.5) closePoints++;
    }
    if (closePoints / arc.points.length < 0.5) continue;
    fittedCircles.push({ cx: fit.cx, cy: fit.cy, r: fit.r, fitError: fit.error, arcCoverage: coverage, arcLength: arc.arcLength, arcPoints: arc.points, type: "fitted" });
  }
  fittedCircles.sort((a, b) => (b.arcLength * b.arcCoverage / (1 + b.fitError)) - (a.arcLength * a.arcCoverage / (1 + a.fitError)));
  fittedCircles = mergeCircles(fittedCircles, logoSize * 0.035);
  fittedCircles = fittedCircles.slice(0, 15);

  // ---- Fibonacci base unit ----
  const radii = fittedCircles.map(c => c.r).sort((a, b) => a - b);
  let bestBaseUnit = logoSize / 21;
  let bestBaseError = Infinity;
  if (radii.length > 0) {
    for (const refR of [radii[0], radii[Math.floor(radii.length / 2)]]) {
      for (const fib of FIBONACCI) {
        if (fib === 0) continue;
        const base = refR / fib;
        if (base <= 0) continue;
        let err = 0;
        for (const r of radii) { const { snappedR } = snapToFibonacci(r, base); err += Math.abs(r - snappedR) / r; }
        if (err < bestBaseError) { bestBaseError = err; bestBaseUnit = base; }
      }
    }
  }

  // ---- Ideal circles ----
  const idealCircles: IdealCircle[] = fittedCircles.map(fc => {
    const { snappedR, fibIdx } = snapToFibonacci(fc.r, bestBaseUnit);
    return { cx: fc.cx, cy: fc.cy, r: snappedR, originalR: fc.r, fibIndex: fibIdx, type: "ideal" };
  });

  // ---- Golden ratio circles ----
  const cx = centerOfMass.x, cy = centerOfMass.y;
  const goldenBaseUnit = Math.min(bounds.width, bounds.height) / 21;
  const goldenCircles: SimpleCircle[] = [];
  for (const fib of FIBONACCI) {
    const r = fib * goldenBaseUnit;
    if (r < 3 || r > logoSize * 1.5) continue;
    goldenCircles.push({ cx, cy, r, type: "golden" });
  }

  // ---- Concentric circles ----
  const concentricCircles: SimpleCircle[] = [];
  const maxConcentricR = Math.max(bounds.width, bounds.height) * 0.7;
  for (let i = 1; i <= 7; i++) {
    concentricCircles.push({ cx, cy, r: (maxConcentricR * i) / 7, type: "concentric" });
  }

  // ---- NEW: Bounding circles (Welzl minimum enclosing) ----
  const boundingCircles: SimpleCircle[] = [];
  const bounding = minBoundingCircle(edgePoints.length > 500 ? edgePoints.filter((_, i) => i % 3 === 0) : edgePoints);
  if (bounding) {
    boundingCircles.push(bounding);
    // Also add half and golden-ratio subdivisions of the bounding circle
    boundingCircles.push({ cx: bounding.cx, cy: bounding.cy, r: bounding.r / PHI, type: "bounding", label: "Bounding/\u03C6" });
    boundingCircles.push({ cx: bounding.cx, cy: bounding.cy, r: bounding.r / 2, type: "bounding", label: "Bounding/2" });
  }
  // Inscribed circle
  if (imageData) {
    const inscribed = maxInscribedCircle(imageData.data, imageData.width, imageData.height, bounds);
    if (inscribed) boundingCircles.push(inscribed);
  }

  // ---- NEW: Osculating circles at curvature maxima ----
  const osculatingResult = osculatingCircles(arcs, minRadius, maxRadius);

  // ---- NEW: Corner radius circles ----
  const cornerResult = cornerRadiusCircles(arcs, minRadius * 0.5, maxRadius * 0.5);

  // ---- NEW: Tangent circles between fitted circles ----
  const tangentResult = tangentCirclePairs(fittedCircles, minRadius, maxRadius);

  // ---- NEW: Keypoint circles through boundary extremes ----
  const keypointResult = keypointCircles(edgePoints, bounds, minRadius * 2, maxRadius);

  // ---- Construction lines ----
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

  // ---- Standard geometric grids ----
  const lx = bounds.x, ly = bounds.y;
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
  for (let i = 1; i < 8; i++) baselineLines.push({ x1: lx, y1: ly + (bounds.height * i) / 8, x2: lx + bounds.width, y2: ly + (bounds.height * i) / 8, type: "baseline" });
  const verticalLines: GridLine[] = [];
  for (let i = 1; i < 8; i++) verticalLines.push({ x1: lx + (bounds.width * i) / 8, y1: ly, x2: lx + (bounds.width * i) / 8, y2: ly + bounds.height, type: "vertical" });

  // ---- Scores ----
  const tolerance = logoSize * 0.025;
  let goldenScore = 0;
  if (fittedCircles.length > 0) {
    let total = 0;
    for (let i = 0; i < fittedCircles.length; i++) total += 1 - Math.abs(fittedCircles[i].r - idealCircles[i].r) / Math.max(fittedCircles[i].r, idealCircles[i].r);
    goldenScore = Math.min(100, Math.round((total / fittedCircles.length) * 100));
  }
  let symHits = 0;
  for (const p of edgePoints) {
    if (edgePoints.some(q => Math.abs(q.x - (2 * cx - p.x)) < tolerance && Math.abs(q.y - p.y) < tolerance)) symHits++;
  }
  const symmetryScore = edgePoints.length > 0 ? Math.min(100, Math.round((symHits / edgePoints.length) * 100)) : 0;
  let alignHits = 0;
  for (const p of edgePoints) {
    for (const c of fittedCircles) {
      if (Math.abs(Math.sqrt((p.x - c.cx) ** 2 + (p.y - c.cy) ** 2) - c.r) < tolerance) { alignHits++; break; }
    }
  }
  const gridAlignScore = edgePoints.length > 0 ? Math.min(100, Math.round((alignHits / edgePoints.length) * 100)) : 0;

  return {
    fittedCircles, idealCircles, goldenCircles, concentricCircles,
    boundingCircles, osculatingCircles: osculatingResult, cornerRadiusCircles: cornerResult,
    tangentCircles: tangentResult, keypointCircles: keypointResult,
    goldenRects, thirdLines, diagonalLines, baselineLines, verticalLines, constructionLines,
    scores: { goldenRatio: goldenScore, symmetry: symmetryScore, gridAlignment: gridAlignScore },
  };
}
