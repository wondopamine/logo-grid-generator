export interface Point {
  x: number;
  y: number;
}

export interface EdgeData {
  points: Point[];
  bounds: { x: number; y: number; width: number; height: number };
  centerOfMass: Point;
}

export function detectEdges(
  imageData: ImageData,
  threshold: number = 30
): EdgeData {
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

  // Sobel edge detection
  const edgeMagnitude = new Float32Array(width * height);
  let maxMag = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      // Sobel X
      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];
      // Sobel Y
      const gy =
        -gray[(y - 1) * width + (x - 1)] +
        -2 * gray[(y - 1) * width + x] +
        -gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];

      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeMagnitude[idx] = mag;
      if (mag > maxMag) maxMag = mag;
    }
  }

  // Extract edge points (sample to avoid too many)
  const points: Point[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = y * width + x;
      if (maxMag > 0 && edgeMagnitude[idx] / maxMag > threshold / 255) {
        points.push({ x, y });
      }
    }
  }

  // Calculate bounds from alpha channel
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  let sumX = 0,
    sumY = 0,
    count = 0;

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

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  const centerOfMass: Point = count > 0
    ? { x: sumX / count, y: sumY / count }
    : { x: width / 2, y: height / 2 };

  return { points, bounds, centerOfMass };
}

export function findKeyPoints(points: Point[], numPoints: number = 20): Point[] {
  if (points.length <= numPoints) return points;

  // Use k-means-like clustering to find key representative points
  const keyPoints: Point[] = [];
  const step = Math.floor(points.length / numPoints);

  for (let i = 0; i < points.length; i += step) {
    if (keyPoints.length < numPoints) {
      keyPoints.push(points[i]);
    }
  }

  return keyPoints;
}
