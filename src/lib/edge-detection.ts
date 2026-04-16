export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  closed: boolean;
  length: number;
}

export interface ArcSegment {
  points: Point[];
  arcLength: number;
  contourIndex: number; // which contour this arc belongs to
  arcIndex: number; // position within the contour's arc sequence
}

export interface CornerRegion {
  quadrant: "NW" | "NE" | "SE" | "SW";
  points: Point[];
  center: Point;
}

export interface EdgeData {
  contours: Contour[];
  arcs: ArcSegment[];
  outerContour: Contour | null;
  innerContours: Contour[];
  cornerRegions: CornerRegion[];
  spiralEye: Point | null;
  spiralEyeRadius: number;
  bounds: { x: number; y: number; width: number; height: number };
  centerOfMass: Point;
  geometricCenter: Point;
  edgePoints: Point[];
  logoSize: number;
}

// ============================================================
// EDGE DETECTION CORE
// ============================================================

function sobelEdges(gray: Float32Array, width: number, height: number) {
  const mag = new Float32Array(width * height);
  const dir = new Float32Array(width * height);
  let maxMag = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
      const gy =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[idx] = m;
      dir[idx] = Math.atan2(gy, gx);
      if (m > maxMag) maxMag = m;
    }
  }
  return { mag, dir, maxMag };
}

function nonMaxSuppression(mag: Float32Array, dir: Float32Array, width: number, height: number, threshold: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (mag[idx] < threshold) continue;
      let angle = ((dir[idx] * 180) / Math.PI + 180) % 180;
      let n1 = 0, n2 = 0;
      if (angle < 22.5 || angle >= 157.5) { n1 = mag[y * width + (x - 1)]; n2 = mag[y * width + (x + 1)]; }
      else if (angle < 67.5) { n1 = mag[(y - 1) * width + (x + 1)]; n2 = mag[(y + 1) * width + (x - 1)]; }
      else if (angle < 112.5) { n1 = mag[(y - 1) * width + x]; n2 = mag[(y + 1) * width + x]; }
      else { n1 = mag[(y - 1) * width + (x - 1)]; n2 = mag[(y + 1) * width + (x + 1)]; }
      if (mag[idx] >= n1 && mag[idx] >= n2) out[idx] = 255;
    }
  }
  return out;
}

function chainLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.sqrt((points[i].x - points[i - 1].x) ** 2 + (points[i].y - points[i - 1].y) ** 2);
  }
  return len;
}

function traceContours(edgeMap: Uint8Array, width: number, height: number, minLength: number): Contour[] {
  const visited = new Uint8Array(width * height);
  const contours: Contour[] = [];
  const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
  const dy = [-1, -1, -1, 0, 1, 1, 1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (edgeMap[idx] === 0 || visited[idx]) continue;
      const points: Point[] = [];
      let cx = x, cy = y;
      let closed = false;
      while (true) {
        const cIdx = cy * width + cx;
        if (visited[cIdx] && points.length > 2) { closed = true; break; }
        visited[cIdx] = 1;
        points.push({ x: cx, y: cy });
        let found = false;
        for (let d = 0; d < 8; d++) {
          const nx = cx + dx[d], ny = cy + dy[d];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (edgeMap[ny * width + nx] > 0 && !visited[ny * width + nx]) { cx = nx; cy = ny; found = true; break; }
        }
        if (!found) break;
        if (points.length > 10000) break;
      }
      const len = chainLength(points);
      if (len >= minLength) contours.push({ points, closed, length: len });
    }
  }
  contours.sort((a, b) => b.length - a.length);
  return contours;
}

// ============================================================
// CURVATURE + ARC SEGMENTATION
// ============================================================

function computeCurvature(points: Point[], k: number): number[] {
  const n = points.length;
  const curvature = new Array(n).fill(0);
  for (let i = k; i < n - k; i++) {
    const prev = points[i - k], curr = points[i], next = points[i + k];
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (len1 > 0.5 && len2 > 0.5) curvature[i] = Math.atan2(cross, dot) / (len1 + len2);
  }
  return curvature;
}

function segmentArcs(contour: Contour, minArcPixelLength: number, contourIndex: number): ArcSegment[] {
  const pts = contour.points;
  if (pts.length < 10) return [];
  const k = Math.max(4, Math.min(12, Math.floor(pts.length / 15)));
  const curvature = computeCurvature(pts, k);
  const arcs: ArcSegment[] = [];
  const cornerThreshold = 0.008;
  const corners: number[] = [0];
  const minSegPoints = Math.max(5, Math.floor(minArcPixelLength));

  for (let i = k + 1; i < pts.length - k - 1; i++) {
    const absCurv = Math.abs(curvature[i]);
    const prevCurv = Math.abs(curvature[i - 1]);
    const signChange = (curvature[i] > 0) !== (curvature[i - 1] > 0) && absCurv > cornerThreshold * 0.3;
    const jump = Math.abs(absCurv - prevCurv) > cornerThreshold;
    if (signChange || jump) {
      if (i - corners[corners.length - 1] >= minSegPoints) corners.push(i);
    }
  }
  corners.push(pts.length - 1);

  let arcIdx = 0;
  for (let i = 0; i < corners.length - 1; i++) {
    const start = corners[i], end = corners[i + 1];
    const segPts = pts.slice(start, end + 1);
    const arcLen = chainLength(segPts);
    if (arcLen < minArcPixelLength) continue;
    const curvSlice = curvature.slice(start, end + 1).filter((_, idx) => idx >= k && idx < segPts.length - k);
    if (curvSlice.length < 3) continue;
    const avgCurv = curvSlice.reduce((s, v) => s + Math.abs(v), 0) / curvSlice.length;
    if (avgCurv < 0.0005) continue;
    const variance = curvSlice.reduce((s, v) => s + (Math.abs(v) - avgCurv) ** 2, 0) / curvSlice.length;
    const stddev = Math.sqrt(variance);
    if (avgCurv > 0.001 && stddev / avgCurv > 3.5) continue;
    arcs.push({ points: segPts, arcLength: arcLen, contourIndex, arcIndex: arcIdx++ });
  }
  return arcs;
}

// ============================================================
// SEMANTIC REGION DETECTION
// ============================================================

// Find the outer contour: longest contour that roughly encloses the bounds
function detectOuterContour(contours: Contour[], bounds: { x: number; y: number; width: number; height: number }): Contour | null {
  if (contours.length === 0) return null;
  // The outer contour is typically the longest contour
  // Verify it's actually outer by checking it spans most of the bounds
  for (const c of contours) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of c.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const spanX = (maxX - minX) / bounds.width;
    const spanY = (maxY - minY) / bounds.height;
    if (spanX > 0.6 && spanY > 0.6) return c;
  }
  return contours[0]; // fallback: longest
}

// Split outer contour into 4 quadrant corner regions
function splitQuadrantCorners(
  outerContour: Contour,
  center: Point,
  bounds: { x: number; y: number; width: number; height: number }
): CornerRegion[] {
  const corners: CornerRegion[] = [];
  const cx = center.x, cy = center.y;

  // Define corner zones: the actual corners of the bounding box ± some margin
  const margin = Math.min(bounds.width, bounds.height) * 0.35;
  const cornerDefs: { quadrant: "NW" | "NE" | "SE" | "SW"; cx: number; cy: number }[] = [
    { quadrant: "NW", cx: bounds.x, cy: bounds.y },
    { quadrant: "NE", cx: bounds.x + bounds.width, cy: bounds.y },
    { quadrant: "SE", cx: bounds.x + bounds.width, cy: bounds.y + bounds.height },
    { quadrant: "SW", cx: bounds.x, cy: bounds.y + bounds.height },
  ];

  for (const def of cornerDefs) {
    const pts = outerContour.points.filter(p => {
      const dx = p.x - def.cx;
      const dy = p.y - def.cy;
      return Math.sqrt(dx * dx + dy * dy) < margin;
    });

    if (pts.length >= 5) {
      // Find the centroid of this corner's points
      const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      corners.push({ quadrant: def.quadrant, points: pts, center: { x: avgX, y: avgY } });
    }
  }
  return corners;
}

// Find the spiral eye: the innermost enclosed region with max distance to edges
function findSpiralEye(
  data: Uint8ClampedArray, width: number, height: number,
  bounds: { x: number; y: number; width: number; height: number },
  edgeMap: Uint8Array
): { point: Point; radius: number } | null {
  // Look for the point INSIDE the letterform (white pixels) that is
  // farthest from any edge. This is the center of the spiral.
  const step = Math.max(2, Math.floor(Math.min(bounds.width, bounds.height) / 80));
  let bestX = 0, bestY = 0, bestDist = 0;

  // We want points inside the white letterform region
  for (let y = bounds.y + step; y < bounds.y + bounds.height - step; y += step) {
    for (let x = bounds.x + step; x < bounds.x + bounds.width - step; x += step) {
      const idx = y * width + x;
      const r = data[idx * 4], g = data[idx * 4 + 1], b = data[idx * 4 + 2], a = data[idx * 4 + 3];

      // Check if this is a "white" or light pixel (part of the letterform)
      const brightness = (r + g + b) / 3;
      if (a < 128 || brightness < 200) continue;

      // Find minimum distance to any edge pixel using ray casting
      let minEdgeDist = Infinity;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        for (let d = 1; d < Math.max(bounds.width, bounds.height) / 2; d += 2) {
          const px = Math.round(x + Math.cos(angle) * d);
          const py = Math.round(y + Math.sin(angle) * d);
          if (px < 0 || px >= width || py < 0 || py >= height) { minEdgeDist = Math.min(minEdgeDist, d); break; }
          if (edgeMap[py * width + px] > 0) { minEdgeDist = Math.min(minEdgeDist, d); break; }
          // Also check if we hit a non-white pixel (edge of letterform)
          const bi = (data[(py * width + px) * 4] + data[(py * width + px) * 4 + 1] + data[(py * width + px) * 4 + 2]) / 3;
          if (data[(py * width + px) * 4 + 3] > 128 && bi < 180) { minEdgeDist = Math.min(minEdgeDist, d); break; }
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
  return { point: { x: bestX, y: bestY }, radius: bestDist };
}

// ============================================================
// MAIN DETECTION
// ============================================================

export function detectEdges(imageData: ImageData): EdgeData {
  const { width, height, data } = imageData;
  const logoSize = Math.max(width, height);

  // Grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    gray[i] = a > 0 ? 0.299 * r + 0.587 * g + 0.114 * b : 0;
  }

  // Gaussian blur
  const blurred = new Float32Array(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) sum += gray[(y + ky) * width + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
      blurred[y * width + x] = sum / 16;
    }
  }

  const { mag, dir, maxMag } = sobelEdges(blurred, width, height);
  const threshold = maxMag * 0.12;
  const thinEdges = nonMaxSuppression(mag, dir, width, height, threshold);

  // Contour tracing
  const minContourLen = Math.max(12, Math.floor(logoSize / 50));
  const contours = traceContours(thinEdges, width, height, minContourLen);

  // Arc segmentation with contour index tracking
  const minArcLen = Math.max(8, Math.floor(logoSize / 60));
  const allArcs: ArcSegment[] = [];
  for (let ci = 0; ci < contours.length; ci++) {
    const arcs = segmentArcs(contours[ci], minArcLen, ci);
    allArcs.push(...arcs);
  }
  allArcs.sort((a, b) => b.arcLength - a.arcLength);

  // Edge points
  const edgePoints: Point[] = [];
  const step = Math.max(1, Math.floor(logoSize / 400));
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      if (thinEdges[y * width + x] > 0) edgePoints.push({ x, y });
    }
  }

  // Bounds from alpha
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let sumX = 0, sumY = 0, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x; sumY += y; count++;
      }
    }
  }

  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const centerOfMass: Point = count > 0 ? { x: sumX / count, y: sumY / count } : { x: width / 2, y: height / 2 };
  const geometricCenter: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  // Semantic region detection
  const outerContour = detectOuterContour(contours, bounds);
  const innerContours = contours.filter(c => c !== outerContour);
  const cornerRegions = outerContour ? splitQuadrantCorners(outerContour, geometricCenter, bounds) : [];

  // Spiral eye detection
  const spiralResult = findSpiralEye(data, width, height, bounds, thinEdges);

  return {
    contours, arcs: allArcs,
    outerContour, innerContours, cornerRegions,
    spiralEye: spiralResult?.point || null,
    spiralEyeRadius: spiralResult?.radius || 0,
    bounds, centerOfMass, geometricCenter, edgePoints, logoSize,
  };
}
