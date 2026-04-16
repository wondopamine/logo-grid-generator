export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  closed: boolean;
}

export interface ArcSegment {
  points: Point[];
  startIdx: number;
  endIdx: number;
}

export interface EdgeData {
  contours: Contour[];
  arcs: ArcSegment[];
  bounds: { x: number; y: number; width: number; height: number };
  centerOfMass: Point;
  edgePoints: Point[];
}

// Sobel edge detection → magnitude + direction
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

// Non-maximum suppression: thin edges to 1px
function nonMaxSuppression(
  mag: Float32Array, dir: Float32Array, width: number, height: number, threshold: number
): Uint8Array {
  const out = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (mag[idx] < threshold) continue;

      // Quantize direction to 0, 45, 90, 135 degrees
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

// 8-connectivity contour tracing
function traceContours(edgeMap: Uint8Array, width: number, height: number, minLength: number): Contour[] {
  const visited = new Uint8Array(width * height);
  const contours: Contour[] = [];
  const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
  const dy = [-1, -1, -1, 0, 1, 1, 1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (edgeMap[idx] === 0 || visited[idx]) continue;

      // Trace from this point
      const points: Point[] = [];
      let cx = x, cy = y;
      let closed = false;

      while (true) {
        const cIdx = cy * width + cx;
        if (visited[cIdx] && points.length > 2) {
          closed = true;
          break;
        }
        visited[cIdx] = 1;
        points.push({ x: cx, y: cy });

        // Find next unvisited neighbor
        let found = false;
        for (let d = 0; d < 8; d++) {
          const nx = cx + dx[d];
          const ny = cy + dy[d];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (edgeMap[nIdx] > 0 && !visited[nIdx]) {
            cx = nx;
            cy = ny;
            found = true;
            break;
          }
        }
        if (!found) break;
        if (points.length > 5000) break; // safety limit
      }

      if (points.length >= minLength) {
        contours.push({ points, closed });
      }
    }
  }

  return contours;
}

// Compute curvature at each point using k-neighbor window
function computeCurvature(points: Point[], k: number = 5): number[] {
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

    if (len1 > 0 && len2 > 0) {
      curvature[i] = Math.atan2(cross, dot) / (len1 + len2);
    }
  }
  return curvature;
}

// Segment contour into arcs at curvature discontinuities
function segmentArcs(contour: Contour, minArcLength: number = 8): ArcSegment[] {
  const pts = contour.points;
  if (pts.length < minArcLength) return [];

  const k = Math.max(3, Math.min(8, Math.floor(pts.length / 20)));
  const curvature = computeCurvature(pts, k);
  const arcs: ArcSegment[] = [];

  // Find corners: points where curvature changes sign or magnitude jumps
  const cornerThreshold = 0.015;
  const corners: number[] = [0];

  for (let i = k + 1; i < pts.length - k - 1; i++) {
    const absCurv = Math.abs(curvature[i]);
    const prevCurv = Math.abs(curvature[i - 1]);
    const signChange = (curvature[i] > 0) !== (curvature[i - 1] > 0) && absCurv > cornerThreshold * 0.5;
    const jump = Math.abs(absCurv - prevCurv) > cornerThreshold;

    if (signChange || jump) {
      // Only add if sufficiently far from last corner
      if (i - corners[corners.length - 1] >= minArcLength) {
        corners.push(i);
      }
    }
  }
  corners.push(pts.length - 1);

  // Create arc segments between consecutive corners
  for (let i = 0; i < corners.length - 1; i++) {
    const start = corners[i];
    const end = corners[i + 1];
    if (end - start >= minArcLength) {
      const arcPts = pts.slice(start, end + 1);
      // Check if this segment has enough curvature to be an arc (not a straight line)
      const curvSlice = curvature.slice(start, end + 1);
      const maxCurv = Math.max(...curvSlice.map(Math.abs));
      if (maxCurv > 0.002) {
        arcs.push({ points: arcPts, startIdx: start, endIdx: end });
      }
    }
  }

  return arcs;
}

export function detectEdges(imageData: ImageData): EdgeData {
  const { width, height, data } = imageData;

  // Convert to grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    gray[i] = a > 0 ? 0.299 * r + 0.587 * g + 0.114 * b : 0;
  }

  // Sobel + NMS
  const { mag, dir, maxMag } = sobelEdges(gray, width, height);
  const threshold = maxMag * 0.12;
  const thinEdges = nonMaxSuppression(mag, dir, width, height, threshold);

  // Contour tracing
  const minContourLen = Math.max(10, Math.floor(Math.min(width, height) / 40));
  const contours = traceContours(thinEdges, width, height, minContourLen);

  // Arc segmentation
  const allArcs: ArcSegment[] = [];
  for (const contour of contours) {
    const arcs = segmentArcs(contour, Math.max(6, Math.floor(minContourLen / 2)));
    allArcs.push(...arcs);
  }

  // Collect all edge points for scoring
  const edgePoints: Point[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 300));
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      if (thinEdges[y * width + x] > 0) {
        edgePoints.push({ x, y });
      }
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
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const centerOfMass: Point = count > 0
    ? { x: sumX / count, y: sumY / count }
    : { x: width / 2, y: height / 2 };

  return { contours, arcs: allArcs, bounds, centerOfMass, edgePoints };
}
