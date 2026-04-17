import type { SmartGridResult } from "./smart-grid";
import type { TWStructure } from "./use-logo-store";

interface Point {
  x: number;
  y: number;
}

export interface ControlPair {
  /** Current position of the anchor in the source image. */
  source: Point;
  /** Target position in the refined output. */
  dest: Point;
  /** Relative importance (higher = stronger pull). */
  weight: number;
}

/**
 * MLS similarity transform (Schaefer 2006, eq. 5 for similarity).
 * Given control point pairs (p_i → q_i) with weights w_i, returns a
 * smoothly-varying 2D similarity transform f(v) evaluated at v.
 *
 * For each query point v, the weighted least-squares solution for
 *   f(x) = M (x - p*) + q*,    M = [[a, -b], [b, a]]
 * is:
 *   a = (Σ w_i (p̂_i · q̂_i)) / μ_s
 *   b = (Σ w_i (p̂_i × q̂_i)) / μ_s
 *   μ_s = Σ w_i |p̂_i|²
 *
 * Weights decay as w_i(v) = pw_i / |p_i − v|^(2α), α = 2 here.
 */
function mlsSimilarity(
  vx: number,
  vy: number,
  pxArr: Float64Array,
  pyArr: Float64Array,
  qxArr: Float64Array,
  qyArr: Float64Array,
  pwArr: Float64Array,
  n: number,
  out: { x: number; y: number }
): void {
  let wSum = 0;
  let pStarX = 0, pStarY = 0, qStarX = 0, qStarY = 0;
  const w = __wScratch;

  for (let i = 0; i < n; i++) {
    const dx = pxArr[i] - vx;
    const dy = pyArr[i] - vy;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-6) {
      out.x = qxArr[i];
      out.y = qyArr[i];
      return;
    }
    // α = 2 → exponent 2α = 4 → weight ∝ 1 / d²·d² = 1/d⁴
    const wi = pwArr[i] / (d2 * d2);
    w[i] = wi;
    wSum += wi;
    pStarX += wi * pxArr[i];
    pStarY += wi * pyArr[i];
    qStarX += wi * qxArr[i];
    qStarY += wi * qyArr[i];
  }
  if (wSum < 1e-12) {
    out.x = vx;
    out.y = vy;
    return;
  }
  pStarX /= wSum;
  pStarY /= wSum;
  qStarX /= wSum;
  qStarY /= wSum;

  let muS = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    const px = pxArr[i] - pStarX;
    const py = pyArr[i] - pStarY;
    const qx = qxArr[i] - qStarX;
    const qy = qyArr[i] - qStarY;
    const wi = w[i];
    muS += wi * (px * px + py * py);
    sumA += wi * (px * qx + py * qy);
    sumB += wi * (px * qy - py * qx);
  }
  if (muS < 1e-12) {
    out.x = qStarX;
    out.y = qStarY;
    return;
  }

  const a = sumA / muS;
  const b = sumB / muS;
  const ux = vx - pStarX;
  const uy = vy - pStarY;
  out.x = a * ux - b * uy + qStarX;
  out.y = b * ux + a * uy + qStarY;
}

/**
 * MLS affine transform (Schaefer 2006, eq. 4 for affine).
 * Same problem as similarity but M is a full 2×2 matrix — allows shear and
 * non-uniform scale. More DOF means more dramatic local reshape; less rigid.
 *
 * Closed form:
 *   Σ_pp = Σ w_i (p̂_i p̂_iᵀ)       (2×2 weighted covariance of p̂)
 *   Σ_pq = Σ w_i (p̂_i q̂_iᵀ)       (2×2 cross-covariance)
 *   M    = Σ_pq · Σ_pp⁻¹
 *   f(v) = M (v − p*) + q*
 */
function mlsAffine(
  vx: number,
  vy: number,
  pxArr: Float64Array,
  pyArr: Float64Array,
  qxArr: Float64Array,
  qyArr: Float64Array,
  pwArr: Float64Array,
  n: number,
  out: { x: number; y: number }
): void {
  let wSum = 0;
  let pStarX = 0, pStarY = 0, qStarX = 0, qStarY = 0;
  const w = __wScratch;

  for (let i = 0; i < n; i++) {
    const dx = pxArr[i] - vx;
    const dy = pyArr[i] - vy;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-6) {
      out.x = qxArr[i];
      out.y = qyArr[i];
      return;
    }
    const wi = pwArr[i] / (d2 * d2);
    w[i] = wi;
    wSum += wi;
    pStarX += wi * pxArr[i];
    pStarY += wi * pyArr[i];
    qStarX += wi * qxArr[i];
    qStarY += wi * qyArr[i];
  }
  if (wSum < 1e-12) {
    out.x = vx;
    out.y = vy;
    return;
  }
  pStarX /= wSum;
  pStarY /= wSum;
  qStarX /= wSum;
  qStarY /= wSum;

  // Σ_pp entries
  let a = 0, b = 0, c = 0; // [[a, b], [b, c]] (symmetric)
  // Σ_pq entries (rows: pp, cols: q components)
  let m00 = 0, m01 = 0, m10 = 0, m11 = 0; // [[Σ px*qx, Σ px*qy], [Σ py*qx, Σ py*qy]]

  for (let i = 0; i < n; i++) {
    const px = pxArr[i] - pStarX;
    const py = pyArr[i] - pStarY;
    const qx = qxArr[i] - qStarX;
    const qy = qyArr[i] - qStarY;
    const wi = w[i];
    a += wi * px * px;
    b += wi * px * py;
    c += wi * py * py;
    m00 += wi * px * qx;
    m01 += wi * px * qy;
    m10 += wi * py * qx;
    m11 += wi * py * qy;
  }

  // Σ_pp⁻¹ = (1/det) [[c, -b], [-b, a]]
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-12) {
    out.x = qStarX;
    out.y = qStarY;
    return;
  }
  const invA = c / det;
  const invB = -b / det;
  const invC = a / det;

  // M = Σ_pq · Σ_pp⁻¹
  // Row-major multiply: M[row][col] = Σ_pq[row][k] * Σ_pp⁻¹[k][col]
  const M00 = m00 * invA + m10 * invB; // Σ_pq row0 · Σ_pp⁻¹ col0
  const M01 = m00 * invB + m10 * invC;
  const M10 = m01 * invA + m11 * invB;
  const M11 = m01 * invB + m11 * invC;

  // f(v) = Mᵀ · (v − p*) + q*
  //
  // Note: the outer product construction above gives M such that
  //   f(v) − q* = [ux, uy] · M
  // i.e. v as a row vector times M. Equivalent to Mᵀ · v when v is a column.
  const ux = vx - pStarX;
  const uy = vy - pStarY;
  out.x = ux * M00 + uy * M10 + qStarX;
  out.y = ux * M01 + uy * M11 + qStarY;
}

// Scratch buffer reused across MLS calls — sized once, per warp pass
let __wScratch = new Float64Array(0);

/**
 * Build control-point pairs from Smart Grid circles + TW structure.
 *
 * For each Smart Grid circle, every arc point is paired with its nearest-point
 * projection onto the circle. These are the bulk "keep-shape, pull-onto-ideal"
 * anchors. When deviation is small the pair is near-identity (no movement).
 *
 * TW structure contributions are stronger — squircle corners, spiral eye,
 * bridge — each sampled with higher weight so they dominate locally.
 *
 * Boundary anchors (image edges) are identity pairs with medium weight so the
 * outer frame doesn't drift.
 */
export function buildControlPairs(
  smartGrid: SmartGridResult | null,
  twStructure: TWStructure | null,
  width: number,
  height: number,
  options: {
    equalizeSquircleCorners: boolean;
    clampSpiralEye: boolean;
    bridgeTangent: boolean;
    mode: "holistic" | "targeted";
  }
): ControlPair[] {
  const pairs: ControlPair[] = [];
  const isTargeted = options.mode === "targeted";

  // (1) Smart-grid preservation — ONLY in holistic mode. In targeted mode we
  //     drop this so the TW enforcements aren't averaged into identity by
  //     ~120 near-zero pairs.
  if (!isTargeted && smartGrid) {
    for (const circle of smartGrid.circles) {
      const samples = pickArcSamples(circle.arcPoints, 6);
      for (const p of samples) {
        const dx = p.x - circle.cx;
        const dy = p.y - circle.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-6) continue;
        const idealX = circle.cx + (dx / d) * circle.r;
        const idealY = circle.cy + (dy / d) * circle.r;
        pairs.push({
          source: { x: p.x, y: p.y },
          dest: { x: idealX, y: idealY },
          weight: 1.0,
        });
      }
    }
  }

  // (2) TW semantic enforcements — both modes; weights bumped in targeted
  //     so the features visibly snap onto their ideal circles.
  if (twStructure) {
    const wCorner = isTargeted ? 8.0 : 3.5;
    const wEye = isTargeted ? 6.0 : 3.0;
    const wBridge = isTargeted ? 5.0 : 2.2;

    if (options.equalizeSquircleCorners) {
      for (const corner of twStructure.squircleCorners) {
        const fittedCx = corner.cx;
        const fittedCy = corner.cy;
        const fittedR = corner.originalR;
        const idealCx = corner.cx;
        const idealCy = corner.cy;
        const idealR = corner.r;
        for (let a = 0; a < 12; a++) {
          const theta = (a / 12) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          pairs.push({
            source: { x: fittedCx + cos * fittedR, y: fittedCy + sin * fittedR },
            dest: { x: idealCx + cos * idealR, y: idealCy + sin * idealR },
            weight: wCorner,
          });
        }
      }
    }
    if (options.clampSpiralEye && twStructure.spiralEye && smartGrid) {
      pairs.push(...pullArcsOntoCircle(smartGrid, twStructure.spiralEye, wEye, 1.8));
    }
    if (options.bridgeTangent && twStructure.bridge && smartGrid) {
      pairs.push(...pullArcsOntoCircle(smartGrid, twStructure.bridge, wBridge, 2.5));
    }
  }

  // (3) Boundary anchors — weaker in targeted so the frame can breathe while
  //     features reshape, stronger in holistic to keep the whole thing stable.
  const boundaryWeight = isTargeted ? 0.25 : 0.6;
  const bstep = Math.max(1, Math.floor(Math.min(width, height) / 6));
  for (let x = 0; x <= width; x += bstep) {
    pairs.push({ source: { x, y: 0 }, dest: { x, y: 0 }, weight: boundaryWeight });
    pairs.push({ source: { x, y: height - 1 }, dest: { x, y: height - 1 }, weight: boundaryWeight });
  }
  for (let y = bstep; y < height - 1; y += bstep) {
    pairs.push({ source: { x: 0, y }, dest: { x: 0, y }, weight: boundaryWeight });
    pairs.push({ source: { x: width - 1, y }, dest: { x: width - 1, y }, weight: boundaryWeight });
  }

  return pairs;
}

function pickArcSamples<T extends Point>(arcPoints: T[], maxCount: number): T[] {
  if (arcPoints.length <= maxCount) return arcPoints;
  const out: T[] = [];
  const step = (arcPoints.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i++) {
    out.push(arcPoints[Math.round(i * step)]);
  }
  return out;
}

/**
 * Pull existing logo edges (from smart-grid arc samples) onto a target ideal
 * circle. Any smart-grid circle that overlaps the target region contributes its
 * arc points, each paired with its projection onto the ideal circle.
 *
 * This is what makes "Clamp spiral eye" and "Apply tangent bridge" actually do
 * something — previously they pinned identity points and had zero effect.
 *
 * `searchRadiusMult` — how far from the target center to look for contributing
 * arcs (in multiples of target.r).
 */
function pullArcsOntoCircle(
  smartGrid: SmartGridResult,
  target: { cx: number; cy: number; r: number },
  weight: number,
  searchRadiusMult: number,
): ControlPair[] {
  const pairs: ControlPair[] = [];
  const searchR = target.r * searchRadiusMult;
  for (const sc of smartGrid.circles) {
    // Skip the outer/bounding circles — we only want arcs near this target
    const dCenter = Math.sqrt((sc.cx - target.cx) ** 2 + (sc.cy - target.cy) ** 2);
    if (dCenter > searchR) continue;
    if (sc.r > target.r * 3) continue; // too big to be a local feature
    for (const p of pickArcSamples(sc.arcPoints, 8)) {
      const dx = p.x - target.cx;
      const dy = p.y - target.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-3) continue;
      if (d > searchR) continue; // point too far from target
      const projX = target.cx + (dx / d) * target.r;
      const projY = target.cy + (dy / d) * target.r;
      pairs.push({
        source: { x: p.x, y: p.y },
        dest: { x: projX, y: projY },
        weight,
      });
    }
  }
  return pairs;
}

/**
 * Apply MLS similarity warp as an inverse mapping.
 *
 * Inverse warp: for each OUTPUT pixel v, compute where to sample in the SOURCE.
 * So MLS gets destination-anchors as "p" and source-anchors as "q".
 *
 * MLS is evaluated on a coarse grid (every `coarseStep` pixels) and bilinearly
 * interpolated per pixel — O(gridCells × controls) instead of O(pixels × controls),
 * which is a 64× speedup at coarseStep=8.
 */
export function warpImageMLS(
  sourceImageData: ImageData,
  pairs: ControlPair[],
  strength: number,
  mode: "holistic" | "targeted" = "holistic",
  coarseStep: number = 6,
): ImageData {
  const { width, height, data: srcData } = sourceImageData;
  if (strength <= 0 || pairs.length < 3) return sourceImageData;

  const mlsFn = mode === "targeted" ? mlsAffine : mlsSimilarity;

  const n = pairs.length;
  // Swap for inverse mapping: p = dest-space, q = source-space
  const pxArr = new Float64Array(n);
  const pyArr = new Float64Array(n);
  const qxArr = new Float64Array(n);
  const qyArr = new Float64Array(n);
  const pwArr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    pxArr[i] = pairs[i].dest.x;
    pyArr[i] = pairs[i].dest.y;
    qxArr[i] = pairs[i].source.x;
    qyArr[i] = pairs[i].source.y;
    pwArr[i] = pairs[i].weight;
  }
  __wScratch = new Float64Array(n);

  const gw = Math.ceil(width / coarseStep) + 1;
  const gh = Math.ceil(height / coarseStep) + 1;
  const gridX = new Float32Array(gw * gh);
  const gridY = new Float32Array(gw * gh);

  const tmp = { x: 0, y: 0 };
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const vx = gx * coarseStep;
      const vy = gy * coarseStep;
      mlsFn(vx, vy, pxArr, pyArr, qxArr, qyArr, pwArr, n, tmp);
      // Blend with identity based on strength
      const gi = gy * gw + gx;
      gridX[gi] = vx + strength * (tmp.x - vx);
      gridY[gi] = vy + strength * (tmp.y - vy);
    }
  }

  const output = new ImageData(width, height);
  const outData = output.data;

  for (let y = 0; y < height; y++) {
    const gyf = y / coarseStep;
    const gy0 = Math.floor(gyf);
    const fy = gyf - gy0;
    const gy1 = Math.min(gy0 + 1, gh - 1);

    for (let x = 0; x < width; x++) {
      const gxf = x / coarseStep;
      const gx0 = Math.floor(gxf);
      const fx = gxf - gx0;
      const gx1 = Math.min(gx0 + 1, gw - 1);

      const i00 = gy0 * gw + gx0;
      const i10 = gy0 * gw + gx1;
      const i01 = gy1 * gw + gx0;
      const i11 = gy1 * gw + gx1;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const srcX = gridX[i00] * w00 + gridX[i10] * w10 + gridX[i01] * w01 + gridX[i11] * w11;
      const srcY = gridY[i00] * w00 + gridY[i10] * w10 + gridY[i01] * w01 + gridY[i11] * w11;

      const outIdx = (y * width + x) * 4;

      const sx0 = Math.floor(srcX);
      const sy0 = Math.floor(srcY);
      const sfx = srcX - sx0;
      const sfy = srcY - sy0;
      const sx1 = sx0 + 1;
      const sy1 = sy0 + 1;

      if (sx0 >= 0 && sx1 < width && sy0 >= 0 && sy1 < height) {
        const i00s = (sy0 * width + sx0) * 4;
        const i10s = (sy0 * width + sx1) * 4;
        const i01s = (sy1 * width + sx0) * 4;
        const i11s = (sy1 * width + sx1) * 4;
        const sw00 = (1 - sfx) * (1 - sfy);
        const sw10 = sfx * (1 - sfy);
        const sw01 = (1 - sfx) * sfy;
        const sw11 = sfx * sfy;
        for (let c = 0; c < 4; c++) {
          outData[outIdx + c] = Math.round(
            srcData[i00s + c] * sw00 +
              srcData[i10s + c] * sw10 +
              srcData[i01s + c] * sw01 +
              srcData[i11s + c] * sw11,
          );
        }
      } else if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const si = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        outData[outIdx] = srcData[si];
        outData[outIdx + 1] = srcData[si + 1];
        outData[outIdx + 2] = srcData[si + 2];
        outData[outIdx + 3] = srcData[si + 3];
      } else {
        outData[outIdx] = 0;
        outData[outIdx + 1] = 0;
        outData[outIdx + 2] = 0;
        outData[outIdx + 3] = 0;
      }
    }
  }

  return output;
}
