export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  closed: boolean;
  length: number; // total pixel length of contour
}

export interface ArcSegment {
  points: Point[];
  arcLength: number; // pixel length of this arc
}

export interface EdgeData {
  contours: Contour[];
  arcs: ArcSegment[];
  bounds: { x: number; y: number; width: number; height: number };
  centerOfMass: Point;
  edgePoints: Point[];
  logoSize: number;
}

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

function nonMaxSuppression(
  mag: Float32Array, dir: Float32Array, width: number, height: number, threshold: number
): Uint8Array {
  const out = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (mag[idx] < threshold) continue;

      let angle = ((dir[idx] * 180) / Math.PI + 180) % 180;
      let n1 = 0, n2 = 0;

      if (angle < 22.5 || angle >= 157.5) {
        n1 = mag[y * width + (x - 1)];
        n2 = mag[y * width + (x + 1)];
      } else if (angle < 67.5) {
        n1 = mag[(y - 1) * width + (x + 1)];
        n2 = mag[(y + 1) * width + (x - 1)];
      } else if (angle < 112.5) {
        n1 = mag[(y - 1) * width + x];
        n2 = mag[(y + 1) * width + x];
      } else {
        n1 = mag[(y - 1) * width + (x - 1)];
        n2 = mag[(y + 1) * width + (x + 1)];
      }

      if (mag[idx] >= n1 && mag[idx] >= n2) {
        out[idx] = 255;
      }
    }
  }
  return out;
}

// Compute pixel-length of a point chain
function chainLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
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
          const nx = cx + dx[d];
          const ny = cy + dy[d];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (edgeMap[nIdx] > 0 && !visited[nIdx]) {
            cx = nx; cy = ny; found = true; break;
          }
        }
        if (!found) break;
        if (points.length > 10000) break;
      }

      const len = chainLength(points);
      if (len >= minLength) {
        contours.push({ points, closed, length: len });
      }
    }
  }

  // Sort by length descending — longest contours are most important
  contours.sort((a, b) => b.length - a.length);
  return contours;
}

// Smooth curvature using a running average
function computeCurvature(points: Point[], k: number): number[] {
  const n = points.length;
  const curvature = new Array(n).fill(0);

  for (let i = k; i < n - k; i++) {
    const prev = points[i - k];
    const curr = points[i];
    const next = points[i + k];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (len1 > 0.5 && len2 > 0.5) {
      curvature[i] = Math.atan2(cross, dot) / (len1 + len2);
    }
  }
  return curvature;
}

function segmentArcs(contour: Contour, minArcPixelLength: number): ArcSegment[] {
  const pts = contour.points;
  if (pts.length < 10) return [];

  // Use larger k for smoother curvature on longer contours
  const k = Math.max(4, Math.min(12, Math.floor(pts.length / 15)));
  const curvature = computeCurvature(pts, k);
  const arcs: ArcSegment[] = [];

  // Find corners: sharp curvature changes or near-zero curvature (straight segments)
  const cornerThreshold = 0.008;
  const corners: number[] = [0];
  const minSegPoints = Math.max(5, Math.floor(minArcPixelLength));

  for (let i = k + 1; i < pts.length - k - 1; i++) {
    const absCurv = Math.abs(curvature[i]);
    const prevCurv = Math.abs(curvature[i - 1]);
    const signChange = (curvature[i] > 0) !== (curvature[i - 1] > 0) && absCurv > cornerThreshold * 0.3;
    const jump = Math.abs(absCurv - prevCurv) > cornerThreshold;

    if (signChange || jump) {
      if (i - corners[corners.length - 1] >= minSegPoints) {
        corners.push(i);
      }
    }
  }
  corners.push(pts.length - 1);

  for (let i = 0; i < corners.length - 1; i++) {
    const start = corners[i];
    const end = corners[i + 1];
    const segPts = pts.slice(start, end + 1);
    const arcLen = chainLength(segPts);

    if (arcLen < minArcPixelLength) continue;

    // Check curvature: must have consistent non-zero curvature (it's an ARC, not a line)
    const curvSlice = curvature.slice(start, end + 1).filter((_, idx) => idx >= k && idx < segPts.length - k);
    if (curvSlice.length < 3) continue;

    const avgCurv = curvSlice.reduce((s, v) => s + Math.abs(v), 0) / curvSlice.length;
    if (avgCurv < 0.0005) continue; // too straight

    // Curvature consistency: allow organic curves (higher tolerance)
    const variance = curvSlice.reduce((s, v) => s + (Math.abs(v) - avgCurv) ** 2, 0) / curvSlice.length;
    const stddev = Math.sqrt(variance);
    if (avgCurv > 0.001 && stddev / avgCurv > 3.5) continue; // only reject wildly inconsistent

    arcs.push({ points: segPts, arcLength: arcLen });
  }

  return arcs;
}

export function detectEdges(imageData: ImageData): EdgeData {
  const { width, height, data } = imageData;
  const logoSize = Math.max(width, height);

  // Grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    gray[i] = a > 0 ? 0.299 * r + 0.587 * g + 0.114 * b : 0;
  }

  // Gaussian blur (3x3) to reduce noise before edge detection
  const blurred = new Float32Array(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kSum = 16;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      blurred[y * width + x] = sum / kSum;
    }
  }

  const { mag, dir, maxMag } = sobelEdges(blurred, width, height);
  const threshold = maxMag * 0.12;
  const thinEdges = nonMaxSuppression(mag, dir, width, height, threshold);

  // Minimum contour length: ~2% of logo size (lower = more contours found)
  const minContourLen = Math.max(12, Math.floor(logoSize / 50));
  const contours = traceContours(thinEdges, width, height, minContourLen);

  // Minimum arc length: ~1.5% of logo size (allow smaller construction circles)
  const minArcLen = Math.max(8, Math.floor(logoSize / 60));
  const allArcs: ArcSegment[] = [];
  for (const contour of contours) {
    const arcs = segmentArcs(contour, minArcLen);
    allArcs.push(...arcs);
  }

  // Sort arcs by length — longest arcs are most important
  allArcs.sort((a, b) => b.arcLength - a.arcLength);

  // Edge points for scoring
  const edgePoints: Point[] = [];
  const step = Math.max(1, Math.floor(logoSize / 400));
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      if (thinEdges[y * width + x] > 0) edgePoints.push({ x, y });
    }
  }

  // Bounds
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
  const centerOfMass: Point = count > 0
    ? { x: sumX / count, y: sumY / count }
    : { x: width / 2, y: height / 2 };

  return { contours, arcs: allArcs, bounds, centerOfMass, edgePoints, logoSize };
}
