import type { FittedCircle, IdealCircle } from "./grid-generator";

interface DisplacementVector {
  dx: number;
  dy: number;
  weight: number;
}

// Compute displacement field that morphs fitted circles toward ideal circles
function computeDisplacements(
  fitted: FittedCircle[],
  ideal: IdealCircle[],
  width: number,
  height: number,
  influenceRadius: number
): { dx: Float32Array; dy: Float32Array } {
  const size = width * height;
  const dx = new Float32Array(size);
  const dy = new Float32Array(size);
  const weights = new Float32Array(size);

  for (let ci = 0; ci < fitted.length && ci < ideal.length; ci++) {
    const fc = fitted[ci];
    const ic = ideal[ci];

    // For each arc point, compute the displacement to move it onto the ideal circle
    for (const p of fc.arcPoints) {
      // Current position relative to fitted circle center
      const distToFitted = Math.sqrt((p.x - fc.cx) ** 2 + (p.y - fc.cy) ** 2);
      if (distToFitted < 0.1) continue;

      // Direction from fitted center to point
      const dirX = (p.x - fc.cx) / distToFitted;
      const dirY = (p.y - fc.cy) / distToFitted;

      // Where this point should be on the ideal circle
      const idealX = ic.cx + dirX * ic.r;
      const idealY = ic.cy + dirY * ic.r;

      // Displacement at this point
      const pdx = idealX - p.x;
      const pdy = idealY - p.y;

      // Spread displacement to nearby pixels using Gaussian falloff
      const spreadR = influenceRadius;
      const x0 = Math.max(0, Math.floor(p.x - spreadR));
      const x1 = Math.min(width - 1, Math.ceil(p.x + spreadR));
      const y0 = Math.max(0, Math.floor(p.y - spreadR));
      const y1 = Math.min(height - 1, Math.ceil(p.y + spreadR));

      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const d = Math.sqrt((px - p.x) ** 2 + (py - p.y) ** 2);
          if (d > spreadR) continue;
          const w = Math.exp(-(d * d) / (2 * (spreadR / 3) ** 2));
          const idx = py * width + px;
          dx[idx] += pdx * w;
          dy[idx] += pdy * w;
          weights[idx] += w;
        }
      }
    }
  }

  // Normalize by total weight
  for (let i = 0; i < size; i++) {
    if (weights[i] > 0) {
      dx[i] /= weights[i];
      dy[i] /= weights[i];
    }
  }

  return { dx, dy };
}

// Apply displacement field to warp the image
export function warpImage(
  sourceImageData: ImageData,
  fitted: FittedCircle[],
  ideal: IdealCircle[],
  strength: number // 0 to 1
): ImageData {
  const { width, height, data: srcData } = sourceImageData;

  if (strength <= 0 || fitted.length === 0) {
    return sourceImageData;
  }

  const logoSize = Math.max(width, height);
  const influenceRadius = logoSize * 0.06;

  const { dx, dy } = computeDisplacements(fitted, ideal, width, height, influenceRadius);

  const output = new ImageData(width, height);
  const outData = output.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Source pixel position (reverse mapping: where in source does this output pixel come from)
      const srcX = x - dx[idx] * strength;
      const srcY = y - dy[idx] * strength;

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = srcX - x0;
      const fy = srcY - y0;

      if (x0 >= 0 && x1 < width && y0 >= 0 && y1 < height) {
        const i00 = (y0 * width + x0) * 4;
        const i10 = (y0 * width + x1) * 4;
        const i01 = (y1 * width + x0) * 4;
        const i11 = (y1 * width + x1) * 4;

        for (let c = 0; c < 4; c++) {
          const v00 = srcData[i00 + c];
          const v10 = srcData[i10 + c];
          const v01 = srcData[i01 + c];
          const v11 = srcData[i11 + c];

          outData[idx * 4 + c] = Math.round(
            v00 * (1 - fx) * (1 - fy) +
            v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy +
            v11 * fx * fy
          );
        }
      } else {
        // Edge: copy original
        for (let c = 0; c < 4; c++) {
          outData[idx * 4 + c] = srcData[idx * 4 + c];
        }
      }
    }
  }

  return output;
}
