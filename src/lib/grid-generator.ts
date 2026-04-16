import type { Point, EdgeData } from "./edge-detection";

export interface Circle {
  cx: number;
  cy: number;
  r: number;
  score: number;
  type: "golden" | "concentric" | "tangent";
}

export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: "diagonal" | "baseline" | "vertical" | "thirds";
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "golden-rect";
}

export interface GridData {
  goldenCircles: Circle[];
  concentricCircles: Circle[];
  tangentCircles: Circle[];
  goldenRects: GridRect[];
  thirdLines: GridLine[];
  diagonalLines: GridLine[];
  baselineLines: GridLine[];
  verticalLines: GridLine[];
  scores: {
    goldenRatio: number;
    symmetry: number;
    gridAlignment: number;
  };
}

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const PHI = (1 + Math.sqrt(5)) / 2;

function distToCircle(p: Point, c: Circle): number {
  const d = Math.sqrt((p.x - c.cx) ** 2 + (p.y - c.cy) ** 2);
  return Math.abs(d - c.r);
}

function scoreCircle(circle: Circle, edgePoints: Point[], tolerance: number): number {
  let hits = 0;
  for (const p of edgePoints) {
    if (distToCircle(p, circle) < tolerance) hits++;
  }
  return edgePoints.length > 0 ? hits / edgePoints.length : 0;
}

export function generateGrid(edgeData: EdgeData, canvasWidth: number, canvasHeight: number): GridData {
  const { points, bounds, centerOfMass } = edgeData;
  const baseUnit = Math.min(bounds.width, bounds.height) / 21;
  const tolerance = baseUnit * 0.8;
  const cx = centerOfMass.x;
  const cy = centerOfMass.y;

  // Golden ratio circles: Fibonacci-scaled radii from center of mass
  const goldenCircles: Circle[] = [];
  for (const fib of FIBONACCI) {
    const r = fib * baseUnit;
    if (r < 3) continue;
    const circle: Circle = { cx, cy, r, score: 0, type: "golden" };
    circle.score = scoreCircle(circle, points, tolerance);
    goldenCircles.push(circle);
  }
  goldenCircles.sort((a, b) => b.score - a.score);

  // Concentric circles from center
  const concentricCircles: Circle[] = [];
  const maxR = Math.max(bounds.width, bounds.height) / 2;
  for (let i = 1; i <= 6; i++) {
    const r = (maxR * i) / 6;
    const circle: Circle = { cx, cy, r, score: 0, type: "concentric" };
    circle.score = scoreCircle(circle, points, tolerance);
    concentricCircles.push(circle);
  }

  // Tangent circles: fit circles through groups of edge points
  const tangentCircles: Circle[] = [];
  if (points.length >= 3) {
    const samples = Math.min(points.length, 50);
    const step = Math.floor(points.length / samples);
    for (let i = 0; i < samples - 2; i += 3) {
      const p1 = points[i * step % points.length];
      const p2 = points[((i + 1) * step) % points.length];
      const p3 = points[((i + 2) * step) % points.length];
      const circle = circleFrom3Points(p1, p2, p3);
      if (circle && circle.r > baseUnit && circle.r < maxR * 2) {
        circle.type = "tangent";
        circle.score = scoreCircle(circle, points, tolerance);
        if (circle.score > 0.01) {
          tangentCircles.push(circle);
        }
      }
    }
    tangentCircles.sort((a, b) => b.score - a.score);
    tangentCircles.splice(8); // Keep top 8
  }

  // Golden rectangle
  const goldenRects: GridRect[] = [];
  const rectW = bounds.width;
  const rectH = bounds.height;
  goldenRects.push({
    x: bounds.x,
    y: bounds.y,
    width: rectW,
    height: rectH,
    type: "golden-rect",
  });
  // Subdivide by golden ratio
  const subW = rectW / PHI;
  goldenRects.push({
    x: bounds.x,
    y: bounds.y,
    width: subW,
    height: rectH,
    type: "golden-rect",
  });
  goldenRects.push({
    x: bounds.x + subW,
    y: bounds.y,
    width: rectW - subW,
    height: rectH,
    type: "golden-rect",
  });

  // Rule of thirds
  const thirdLines: GridLine[] = [];
  const lx = bounds.x;
  const ly = bounds.y;
  for (let i = 1; i <= 2; i++) {
    thirdLines.push({
      x1: lx + (bounds.width * i) / 3,
      y1: ly,
      x2: lx + (bounds.width * i) / 3,
      y2: ly + bounds.height,
      type: "thirds",
    });
    thirdLines.push({
      x1: lx,
      y1: ly + (bounds.height * i) / 3,
      x2: lx + bounds.width,
      y2: ly + (bounds.height * i) / 3,
      type: "thirds",
    });
  }

  // Diagonal construction lines
  const diagonalLines: GridLine[] = [
    { x1: lx, y1: ly, x2: lx + bounds.width, y2: ly + bounds.height, type: "diagonal" },
    { x1: lx + bounds.width, y1: ly, x2: lx, y2: ly + bounds.height, type: "diagonal" },
    { x1: cx, y1: ly, x2: cx, y2: ly + bounds.height, type: "diagonal" },
    { x1: lx, y1: cy, x2: lx + bounds.width, y2: cy, type: "diagonal" },
  ];

  // Baseline grid
  const baselineLines: GridLine[] = [];
  const baselineStep = bounds.height / 8;
  for (let i = 1; i < 8; i++) {
    baselineLines.push({
      x1: lx,
      y1: ly + baselineStep * i,
      x2: lx + bounds.width,
      y2: ly + baselineStep * i,
      type: "baseline",
    });
  }

  // Vertical rhythm
  const verticalLines: GridLine[] = [];
  const vertStep = bounds.width / 8;
  for (let i = 1; i < 8; i++) {
    verticalLines.push({
      x1: lx + vertStep * i,
      y1: ly,
      x2: lx + vertStep * i,
      y2: ly + bounds.height,
      type: "vertical",
    });
  }

  // Calculate scores
  const goldenScore = goldenCircles.length > 0
    ? Math.min(100, Math.round(goldenCircles.reduce((sum, c) => sum + c.score, 0) / goldenCircles.length * 800))
    : 0;

  // Symmetry: compare left and right halves of edge points
  let symHits = 0;
  for (const p of points) {
    const mirrorX = 2 * cx - p.x;
    const hasMatch = points.some(
      (q) => Math.abs(q.x - mirrorX) < tolerance && Math.abs(q.y - p.y) < tolerance
    );
    if (hasMatch) symHits++;
  }
  const symmetryScore = points.length > 0 ? Math.min(100, Math.round((symHits / points.length) * 100)) : 0;

  // Grid alignment: how many edge points fall on thirds/baseline intersections
  let alignHits = 0;
  const allLines = [...thirdLines, ...baselineLines, ...verticalLines];
  for (const p of points) {
    for (const line of allLines) {
      const dist = pointToLineDistance(p, line);
      if (dist < tolerance) {
        alignHits++;
        break;
      }
    }
  }
  const gridAlignScore = points.length > 0 ? Math.min(100, Math.round((alignHits / points.length) * 200)) : 0;

  return {
    goldenCircles,
    concentricCircles,
    tangentCircles,
    goldenRects,
    thirdLines,
    diagonalLines,
    baselineLines,
    verticalLines,
    scores: {
      goldenRatio: goldenScore,
      symmetry: symmetryScore,
      gridAlignment: gridAlignScore,
    },
  };
}

function circleFrom3Points(p1: Point, p2: Point, p3: Point): Circle | null {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) return null;

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) / d;

  const r = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);
  return { cx: ux, cy: uy, r, score: 0, type: "tangent" };
}

function pointToLineDistance(p: Point, line: GridLine): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - line.x1) ** 2 + (p.y - line.y1) ** 2);

  let t = ((p.x - line.x1) * dx + (p.y - line.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = line.x1 + t * dx;
  const projY = line.y1 + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}
