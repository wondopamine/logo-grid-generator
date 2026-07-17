export const DXD_VIEWBOX_SIZE = 1000;
export const DXD_CENTER = DXD_VIEWBOX_SIZE / 2;
export const DXD_CLASSICAL_SHARPNESS = 3;
export const DXD_MASTER_SHARPNESS = 4;
export const DXD_MASTER_ROTATION = 45;
export const DXD_LAW_TOLERANCE = 1e-9;
export const DXD_PHI = (1 + Math.sqrt(5)) / 2;
export const DXD_GOLDEN_WAIST_RATIO = 1 / DXD_PHI;
export const DXD_GOLDEN_SHARPNESS =
  2 - 2 * Math.log2(DXD_GOLDEN_WAIST_RATIO);

export type DxdTreatment = "solid" | "outline";
export type DxdAnimationMode = "draw" | "reveal";

export interface DxdMarkSettings {
  sharpness: number;
  radius: number;
  rotation: number;
  color: string;
  treatment: DxdTreatment;
  strokeWidth: number;
}

export interface DxdExportOptions {
  includeGrid: boolean;
  includePolarGrid: boolean;
  includeRatioGrid: boolean;
  includeKinematicGrid: boolean;
  includePhiGrid: boolean;
  includeConstruction: boolean;
  includeCompass: boolean;
  includeControlPoints: boolean;
  includeMath: boolean;
  includeAnimation: boolean;
  animationMode: DxdAnimationMode;
  duration: number;
  background: string | null;
}

export interface DxdPoint {
  x: number;
  y: number;
}

export interface DxdArcLengthSample {
  parameter: number;
  progress: number;
}

export interface DxdCurveFrame {
  point: DxdPoint;
  tangent: DxdPoint;
  normal: DxdPoint;
  angleDegrees: number;
  signedCurvature: number;
  signedCurvatureRadius: number;
  curvatureRadius: number;
  curvatureCenter: DxdPoint;
  alternateCurvatureCenter: DxdPoint | null;
  atCusp: boolean;
}

export interface DxdConstructionGeometry {
  fixedCircleRadius: number;
  rollingCircleRadius: number;
  rollingCircleCenters: DxdPoint[];
  cuspPoints: DxdPoint[];
  boundingBox: {
    x: number;
    y: number;
    size: number;
  };
}

export interface DxdCompassState {
  center: DxdPoint;
  tracer: DxdPoint;
  oppositeRim: DxdPoint;
  crossStart: DxdPoint;
  crossEnd: DxdPoint;
  rollingCircleRadius: number;
  orbitDegrees: number;
  spinDegrees: number;
}

function signedPower(value: number, exponent: number) {
  return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

/**
 * Ratio between the narrow waist and the half-width of the 45° X bounds.
 * This turns the exponent into a dimension a designer can actually measure.
 */
export function getWaistRatio(sharpness: number) {
  return 2 ** (1 - sharpness / 2);
}

/** Inverse of getWaistRatio: p = 2 - 2 log₂(W/B). */
export function getSharpnessFromWaistRatio(waistRatio: number) {
  if (!Number.isFinite(waistRatio) || waistRatio <= 0) {
    throw new RangeError("Waist ratio must be a positive finite number.");
  }

  return 2 - 2 * Math.log2(waistRatio);
}

function getPointAndDerivative(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  angle: number,
) {
  const radians = (settings.rotation * Math.PI) / 180;
  const cosRotation = Math.cos(radians);
  const sinRotation = Math.sin(radians);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const localX = settings.radius * signedPower(cosine, settings.sharpness);
  const localY = settings.radius * signedPower(sine, settings.sharpness);
  const derivativeX =
    -settings.radius * settings.sharpness * Math.pow(Math.abs(cosine), settings.sharpness - 1) * sine;
  const derivativeY =
    settings.radius * settings.sharpness * Math.pow(Math.abs(sine), settings.sharpness - 1) * cosine;

  return {
    point: {
      x: DXD_CENTER + localX * cosRotation - localY * sinRotation,
      y: DXD_CENTER + localX * sinRotation + localY * cosRotation,
    },
    derivative: {
      x: derivativeX * cosRotation - derivativeY * sinRotation,
      y: derivativeX * sinRotation + derivativeY * cosRotation,
    },
  };
}

function getOpenArcSignedCurvature(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  angle: number,
) {
  const a = Math.abs(Math.cos(angle));
  const b = Math.abs(Math.sin(angle));
  const p = settings.sharpness;
  const numerator = Math.pow(a * b, p - 4);
  const denominator = Math.pow(
    Math.pow(a, 2 * p - 4) + Math.pow(b, 2 * p - 4),
    1.5,
  );

  return -((p - 2) / (settings.radius * p)) * (numerator / denominator);
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

/** Stable SVG transform serialization shared by SSR and browser hydration. */
export function formatCurveFrameTransform(frame: DxdCurveFrame) {
  return `translate(${formatNumber(frame.point.x)} ${formatNumber(frame.point.y)}) rotate(${formatNumber(frame.angleDegrees)})`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function normalizeHexColor(color: string, fallback = "#bdee63") {
  return /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

export function isDxdMaster(
  settings: Pick<DxdMarkSettings, "sharpness" | "rotation">,
) {
  return (
    Math.abs(settings.sharpness - DXD_MASTER_SHARPNESS) < DXD_LAW_TOLERANCE &&
    Math.abs(settings.rotation - DXD_MASTER_ROTATION) < DXD_LAW_TOLERANCE
  );
}

/**
 * Samples the DXD concave superellipse. P=4 is the exact 1:2-waist brand
 * master; P=3 is the classical four-cusp hypocycloid comparison.
 */
export function generateAstroidPoints(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  segments = 512,
) {
  const safeSegments = Math.max(32, Math.round(segments / 4) * 4);

  return Array.from({ length: safeSegments }, (_, index) => {
    const angle = (index / safeSegments) * Math.PI * 2;
    return getPointAndDerivative(settings, angle).point;
  });
}

/** Returns the curve coordinate at normalized progress from 0 to 1. */
export function getAstroidPoint(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  progress: number,
) {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  return getPointAndDerivative(settings, boundedProgress * Math.PI * 2).point;
}

/**
 * Returns the Frenet frame and its osculating circle. At a quartic tip the
 * one-sided curvature radius has the exact finite limit 2R; sharper cusps
 * collapse to radius zero.
 */
export function getAstroidFrame(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  progress: number,
): DxdCurveFrame {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  const angle = boundedProgress * Math.PI * 2;
  const current = getPointAndDerivative(settings, angle);
  const quarterTurn = angle / (Math.PI / 2);
  const atCusp = Math.abs(quarterTurn - Math.round(quarterTurn)) < 1e-10;
  const curvatureEpsilon = (Math.PI * 2) / 65536;
  const sampleAngle = atCusp ? angle + curvatureEpsilon : angle;
  const deltaX = atCusp
    ? DXD_CENTER - current.point.x
    : current.derivative.x;
  const deltaY = atCusp
    ? DXD_CENTER - current.point.y
    : current.derivative.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const tangent = { x: deltaX / length, y: deltaY / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const sampledCurvature = getOpenArcSignedCurvature(settings, sampleAngle);
  let signedCurvature = sampledCurvature;
  let signedCurvatureRadius = sampledCurvature === 0
    ? 0
    : 1 / sampledCurvature;

  if (atCusp && settings.sharpness < DXD_MASTER_SHARPNESS - 1e-8) {
    signedCurvature = Math.sign(sampledCurvature || -1) * Number.POSITIVE_INFINITY;
    signedCurvatureRadius = 0;
  } else if (
    atCusp &&
    Math.abs(settings.sharpness - DXD_MASTER_SHARPNESS) <= 1e-8
  ) {
    signedCurvatureRadius =
      Math.sign(sampledCurvature || -1) * settings.radius * 2;
    signedCurvature = 1 / signedCurvatureRadius;
  }
  const curvatureRadius = Math.abs(signedCurvatureRadius);
  const curvatureCenter = {
    x: current.point.x + normal.x * signedCurvatureRadius,
    y: current.point.y + normal.y * signedCurvatureRadius,
  };
  const alternateCurvatureCenter =
    atCusp && Math.abs(settings.sharpness - DXD_MASTER_SHARPNESS) <= 1e-8
      ? {
          x: current.point.x - normal.x * signedCurvatureRadius,
          y: current.point.y - normal.y * signedCurvatureRadius,
        }
      : null;

  return {
    point: current.point,
    tangent,
    normal,
    angleDegrees: (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI,
    signedCurvature,
    signedCurvatureRadius,
    curvatureRadius,
    curvatureCenter,
    alternateCurvatureCenter,
    atCusp,
  };
}

/**
 * Builds a normalized arc-length lookup for the parametric curve. Parameter
 * time and distance along an astroid are not linear, so drawing and mechanism
 * motion must use this conversion to remain visually coincident.
 */
export function createAstroidArcLengthLookup(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  segments = 1024,
): DxdArcLengthSample[] {
  const safeSegments = Math.max(128, Math.round(segments / 4) * 4);
  const samples: Array<DxdArcLengthSample & { distance: number }> = [
    { parameter: 0, progress: 0, distance: 0 },
  ];
  let previous = getPointAndDerivative(settings, 0).point;
  let totalDistance = 0;

  for (let index = 1; index <= safeSegments; index += 1) {
    const parameter = index / safeSegments;
    const point = getPointAndDerivative(settings, parameter * Math.PI * 2).point;
    totalDistance += Math.hypot(point.x - previous.x, point.y - previous.y);
    samples.push({ parameter, progress: 0, distance: totalDistance });
    previous = point;
  }

  return samples.map(({ parameter, distance }) => ({
    parameter,
    progress: totalDistance === 0 ? parameter : distance / totalDistance,
  }));
}

export function getParameterAtArcProgress(
  lookup: readonly DxdArcLengthSample[],
  progress: number,
) {
  const bounded = Math.min(1, Math.max(0, progress));

  if (lookup.length < 2 || bounded === 0) return 0;
  if (bounded === 1) return 1;

  let low = 0;
  let high = lookup.length - 1;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (lookup[middle].progress < bounded) low = middle;
    else high = middle;
  }

  const from = lookup[low];
  const to = lookup[high];
  const span = to.progress - from.progress;
  const interpolation = span === 0 ? 0 : (bounded - from.progress) / span;
  return from.parameter + (to.parameter - from.parameter) * interpolation;
}

export function createAstroidPath(
  settings: Pick<DxdMarkSettings, "sharpness" | "radius" | "rotation">,
  segments = 64,
  closed = true,
) {
  const safeSegments = Math.max(16, Math.round(segments / 4) * 4);
  const angleStep = (Math.PI * 2) / safeSegments;
  const start = getPointAndDerivative(settings, 0).point;
  const commands = [`M ${formatNumber(start.x)} ${formatNumber(start.y)}`];

  for (let index = 0; index < safeSegments; index += 1) {
    const startAngle = index * angleStep;
    const endAngle = (index + 1) * angleStep;
    const from = getPointAndDerivative(settings, startAngle);
    const to = getPointAndDerivative(settings, endAngle);
    const controlScale = angleStep / 3;
    const control1 = {
      x: from.point.x + from.derivative.x * controlScale,
      y: from.point.y + from.derivative.y * controlScale,
    };
    const control2 = {
      x: to.point.x - to.derivative.x * controlScale,
      y: to.point.y - to.derivative.y * controlScale,
    };

    commands.push(
      `C ${formatNumber(control1.x)} ${formatNumber(control1.y)} ${formatNumber(control2.x)} ${formatNumber(control2.y)} ${formatNumber(to.point.x)} ${formatNumber(to.point.y)}`,
    );
  }

  if (closed) commands.push("Z");
  return commands.join(" ");
}

/**
 * Classical p3 hypocycloid construction used as a comparison layer.
 * A circle of radius a/4 rolls inside a fixed circle of radius a.
 */
export function getConstructionGeometry(radius: number, rotation = 0): DxdConstructionGeometry {
  const fixedCircleRadius = radius;
  const rollingCircleRadius = radius / 4;
  const rollingCenterOffset = fixedCircleRadius - rollingCircleRadius;
  const rotationRadians = (rotation * Math.PI) / 180;
  const axisExtent = radius * Math.max(
    Math.abs(Math.cos(rotationRadians)),
    Math.abs(Math.sin(rotationRadians)),
  );
  const rotatePoint = (point: DxdPoint) => {
    const localX = point.x - DXD_CENTER;
    const localY = point.y - DXD_CENTER;
    return {
      x: DXD_CENTER + localX * Math.cos(rotationRadians) - localY * Math.sin(rotationRadians),
      y: DXD_CENTER + localX * Math.sin(rotationRadians) + localY * Math.cos(rotationRadians),
    };
  };
  const rollingCircleCenters = [
    { x: DXD_CENTER + rollingCenterOffset, y: DXD_CENTER },
    { x: DXD_CENTER, y: DXD_CENTER + rollingCenterOffset },
    { x: DXD_CENTER - rollingCenterOffset, y: DXD_CENTER },
    { x: DXD_CENTER, y: DXD_CENTER - rollingCenterOffset },
  ].map(rotatePoint);
  const cuspPoints = [
    { x: DXD_CENTER + radius, y: DXD_CENTER },
    { x: DXD_CENTER, y: DXD_CENTER + radius },
    { x: DXD_CENTER - radius, y: DXD_CENTER },
    { x: DXD_CENTER, y: DXD_CENTER - radius },
  ].map(rotatePoint);

  return {
    fixedCircleRadius,
    rollingCircleRadius,
    rollingCircleCenters,
    cuspPoints,
    boundingBox: {
      x: DXD_CENTER - axisExtent,
      y: DXD_CENTER - axisExtent,
      size: axisExtent * 2,
    },
  };
}

/**
 * Returns the physical 4:1 hypocycloid mechanism at a point in its orbit.
 * At P=3, the tracer point is exactly the corresponding astroid point.
 */
export function getCompassState(radius: number, progress: number, rotation = 0): DxdCompassState {
  const geometry = getConstructionGeometry(radius);
  const orbitAngle = Math.min(1, Math.max(0, progress)) * Math.PI * 2;
  const rotationAngle = (rotation * Math.PI) / 180;
  const centerOffset = geometry.fixedCircleRadius - geometry.rollingCircleRadius;
  const centerLocal = {
    x: centerOffset * Math.cos(orbitAngle),
    y: centerOffset * Math.sin(orbitAngle),
  };
  const tracerVectorLocal = {
    x: geometry.rollingCircleRadius * Math.cos(orbitAngle * 3),
    y: -geometry.rollingCircleRadius * Math.sin(orbitAngle * 3),
  };

  const rotate = (point: DxdPoint) => ({
    x: point.x * Math.cos(rotationAngle) - point.y * Math.sin(rotationAngle),
    y: point.x * Math.sin(rotationAngle) + point.y * Math.cos(rotationAngle),
  });
  const centerRotated = rotate(centerLocal);
  const tracerVector = rotate(tracerVectorLocal);
  const perpendicularVector = {
    x: -tracerVector.y * 0.72,
    y: tracerVector.x * 0.72,
  };
  const center = {
    x: DXD_CENTER + centerRotated.x,
    y: DXD_CENTER + centerRotated.y,
  };

  return {
    center,
    tracer: {
      x: center.x + tracerVector.x,
      y: center.y + tracerVector.y,
    },
    oppositeRim: {
      x: center.x - tracerVector.x,
      y: center.y - tracerVector.y,
    },
    crossStart: {
      x: center.x - perpendicularVector.x,
      y: center.y - perpendicularVector.y,
    },
    crossEnd: {
      x: center.x + perpendicularVector.x,
      y: center.y + perpendicularVector.y,
    },
    rollingCircleRadius: geometry.rollingCircleRadius,
    orbitDegrees: progress * 360 + rotation,
    spinDegrees: progress * -1440,
  };
}

function renderGrid() {
  const lines: string[] = [];

  for (let position = 100; position <= 900; position += 50) {
    const isMajor = position % 100 === 0;
    lines.push(
      `<line x1="${position}" y1="100" x2="${position}" y2="900" class="${isMajor ? "dxd-grid-major" : "dxd-grid-minor"}" />`,
      `<line x1="100" y1="${position}" x2="900" y2="${position}" class="${isMajor ? "dxd-grid-major" : "dxd-grid-minor"}" />`,
    );
  }

  return `<g id="dxd-grid" aria-label="DXD modular grid">${lines.join("")}</g>`;
}

function renderPolarGrid(radius: number) {
  const circles = [0.25, 0.5, 0.75, 1]
    .map(
      (scale, index) =>
        `<circle cx="${DXD_CENTER}" cy="${DXD_CENTER}" r="${formatNumber(radius * scale)}" class="dxd-polar-${index === 3 ? "major" : "minor"}" />`,
    )
    .join("");
  const rays = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    const x = DXD_CENTER + radius * Math.cos(angle);
    const y = DXD_CENTER + radius * Math.sin(angle);
    return `<line x1="${DXD_CENTER}" y1="${DXD_CENTER}" x2="${formatNumber(x)}" y2="${formatNumber(y)}" class="${index % 4 === 0 ? "dxd-polar-major" : "dxd-polar-minor"}" />`;
  }).join("");

  return `<g id="dxd-polar-grid" aria-label="Polar grid with sixteen angular divisions">${circles}${rays}</g>`;
}

function renderRatioGrid(settings: DxdMarkSettings) {
  const bound = settings.radius / Math.sqrt(2);
  const waistRatio = getWaistRatio(settings.sharpness);
  const waist = bound * waistRatio;
  const start = DXD_CENTER - bound;
  const size = bound * 2;
  const fieldRotation = settings.rotation - DXD_MASTER_ROTATION;
  const ratioLabel = Math.abs(waistRatio - 0.5) < DXD_LAW_TOLERANCE
    ? "W/B = 0.500 / EXACT 1:2"
    : Math.abs(waistRatio - DXD_GOLDEN_WAIST_RATIO) < DXD_LAW_TOLERANCE
      ? "W/B = 0.618 / 1:PHI"
      : `W/B = ${formatNumber(waistRatio)}`;

  return `<g id="dxd-ratio-grid" transform="rotate(${formatNumber(fieldRotation)} ${DXD_CENTER} ${DXD_CENTER})" aria-label="Measured waist-ratio construction field">
    <rect x="${formatNumber(start)}" y="${formatNumber(start)}" width="${formatNumber(size)}" height="${formatNumber(size)}" class="dxd-ratio-bound" />
    <line x1="${formatNumber(start)}" y1="${formatNumber(start)}" x2="${formatNumber(start + size)}" y2="${formatNumber(start + size)}" class="dxd-ratio-diagonal" />
    <line x1="${formatNumber(start + size)}" y1="${formatNumber(start)}" x2="${formatNumber(start)}" y2="${formatNumber(start + size)}" class="dxd-ratio-diagonal" />
    <path d="M ${DXD_CENTER} ${formatNumber(DXD_CENTER - waist)} L ${formatNumber(DXD_CENTER + waist)} ${DXD_CENTER} L ${DXD_CENTER} ${formatNumber(DXD_CENTER + waist)} L ${formatNumber(DXD_CENTER - waist)} ${DXD_CENTER} Z" class="dxd-ratio-waist" />
    <circle cx="${DXD_CENTER}" cy="${DXD_CENTER}" r="${formatNumber(waist)}" class="dxd-ratio-circle" />
    <line x1="${DXD_CENTER}" y1="${formatNumber(DXD_CENTER - waist)}" x2="${formatNumber(DXD_CENTER + bound)}" y2="${formatNumber(DXD_CENTER - waist)}" class="dxd-ratio-measure" />
    <text x="${formatNumber(start)}" y="${formatNumber(start - 16)}" class="dxd-grid-label dxd-ratio-label">${ratioLabel}</text>
  </g>`;
}

function renderKinematicGrid(settings: DxdMarkSettings) {
  const rollingRadius = settings.radius / 4;
  const orbitRadius = settings.radius - rollingRadius;
  const rotationRadians = (settings.rotation * Math.PI) / 180;
  const positions = Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2 + rotationRadians;
    const x = DXD_CENTER + orbitRadius * Math.cos(angle);
    const y = DXD_CENTER + orbitRadius * Math.sin(angle);
    return `<g class="dxd-kinematic-station">
      <line x1="${DXD_CENTER}" y1="${DXD_CENTER}" x2="${formatNumber(x)}" y2="${formatNumber(y)}" />
      <circle cx="${formatNumber(x)}" cy="${formatNumber(y)}" r="${formatNumber(rollingRadius)}" />
      <circle cx="${formatNumber(x)}" cy="${formatNumber(y)}" r="3" class="dxd-kinematic-center" />
    </g>`;
  }).join("");

  return `<g id="dxd-kinematic-grid" aria-label="Twelve-station four-to-one hypocycloid field">
    <circle cx="${DXD_CENTER}" cy="${DXD_CENTER}" r="${formatNumber(orbitRadius)}" class="dxd-center-locus" />
    ${positions}
    <text x="${formatNumber(DXD_CENTER + orbitRadius * 0.72)}" y="${formatNumber(DXD_CENTER - orbitRadius * 0.72 - 12)}" class="dxd-grid-label">CENTER LOCUS / 3R/4</text>
  </g>`;
}

function renderPhiGrid(radius: number) {
  const phi = DXD_PHI;
  const boxStart = DXD_CENTER - radius;
  const size = radius * 2;
  const near = boxStart + size * (1 - 1 / phi);
  const far = boxStart + size / phi;

  return `<g id="dxd-phi-grid" aria-label="Golden ratio comparison field">
    <rect x="${formatNumber(boxStart)}" y="${formatNumber(boxStart)}" width="${formatNumber(size)}" height="${formatNumber(size)}" class="dxd-phi-bound" />
    <line x1="${formatNumber(near)}" y1="${formatNumber(boxStart)}" x2="${formatNumber(near)}" y2="${formatNumber(boxStart + size)}" class="dxd-phi-line" />
    <line x1="${formatNumber(far)}" y1="${formatNumber(boxStart)}" x2="${formatNumber(far)}" y2="${formatNumber(boxStart + size)}" class="dxd-phi-line" />
    <line x1="${formatNumber(boxStart)}" y1="${formatNumber(near)}" x2="${formatNumber(boxStart + size)}" y2="${formatNumber(near)}" class="dxd-phi-line" />
    <line x1="${formatNumber(boxStart)}" y1="${formatNumber(far)}" x2="${formatNumber(boxStart + size)}" y2="${formatNumber(far)}" class="dxd-phi-line" />
    <circle cx="${DXD_CENTER}" cy="${DXD_CENTER}" r="${formatNumber(radius / phi)}" class="dxd-phi-circle" />
    <circle cx="${DXD_CENTER}" cy="${DXD_CENTER}" r="${formatNumber(radius / phi ** 2)}" class="dxd-phi-circle" />
    <text x="${formatNumber(boxStart)}" y="${formatNumber(boxStart - 16)}" class="dxd-grid-label dxd-phi-label">φ = 1.618 / COMPARISON, NOT SOURCE GEOMETRY</text>
  </g>`;
}

function renderCompass(settings: DxdMarkSettings) {
  const geometry = getConstructionGeometry(settings.radius, settings.rotation);
  const rollingCenterX = DXD_CENTER + geometry.fixedCircleRadius - geometry.rollingCircleRadius;
  const tracerX = DXD_CENTER + geometry.fixedCircleRadius;
  const crossExtent = geometry.rollingCircleRadius * 0.72;

  return `<g id="dxd-compass" aria-label="Animated rolling-circle compass tracer">
    <g class="dxd-compass-orbit">
      <g class="dxd-compass-spin">
        <circle cx="${formatNumber(rollingCenterX)}" cy="${DXD_CENTER}" r="${formatNumber(geometry.rollingCircleRadius)}" class="dxd-compass-circle" />
        <line x1="${formatNumber(rollingCenterX - geometry.rollingCircleRadius)}" y1="${DXD_CENTER}" x2="${formatNumber(tracerX)}" y2="${DXD_CENTER}" class="dxd-compass-diameter" />
        <line x1="${formatNumber(rollingCenterX)}" y1="${formatNumber(DXD_CENTER - crossExtent)}" x2="${formatNumber(rollingCenterX)}" y2="${formatNumber(DXD_CENTER + crossExtent)}" class="dxd-compass-cross" />
        <line x1="${formatNumber(rollingCenterX)}" y1="${DXD_CENTER}" x2="${formatNumber(tracerX)}" y2="${DXD_CENTER}" class="dxd-compass-arm" />
        <circle cx="${formatNumber(rollingCenterX)}" cy="${DXD_CENTER}" r="6" class="dxd-compass-pivot" />
        <circle cx="${formatNumber(tracerX)}" cy="${DXD_CENTER}" r="8" class="dxd-compass-tracer" />
      </g>
    </g>
  </g>`;
}

function renderCurvatureCompass(
  path: string,
  settings: DxdMarkSettings,
  duration: number,
  animated: boolean,
) {
  const start = getAstroidFrame(settings, 0);
  const representative = getAstroidFrame(settings, 0.125);
  const staticInstrument = (id: string, frame: DxdCurveFrame) => {
    const alternate = frame.alternateCurvatureCenter
      ? `<circle cx="${formatNumber(frame.alternateCurvatureCenter.x)}" cy="${formatNumber(frame.alternateCurvatureCenter.y)}" r="${formatNumber(frame.curvatureRadius)}" class="dxd-curvature-circle dxd-curvature-alternate" />
        <line x1="${formatNumber(frame.alternateCurvatureCenter.x)}" y1="${formatNumber(frame.alternateCurvatureCenter.y)}" x2="${formatNumber(frame.point.x)}" y2="${formatNumber(frame.point.y)}" class="dxd-curvature-arm dxd-curvature-alternate" />`
      : "";

    return `<g id="${id}" aria-label="Static osculating curvature compass">
    <circle id="${id === "dxd-curvature-compass" ? "dxd-osculating-circle" : "dxd-osculating-circle-reduced"}" cx="${formatNumber(frame.curvatureCenter.x)}" cy="${formatNumber(frame.curvatureCenter.y)}" r="${formatNumber(frame.curvatureRadius)}" class="dxd-curvature-circle" />
    ${alternate}
    <line x1="${formatNumber(frame.curvatureCenter.x)}" y1="${formatNumber(frame.curvatureCenter.y)}" x2="${formatNumber(frame.point.x)}" y2="${formatNumber(frame.point.y)}" class="dxd-curvature-arm" />
    <circle cx="${formatNumber(frame.curvatureCenter.x)}" cy="${formatNumber(frame.curvatureCenter.y)}" r="6" class="dxd-curvature-pivot" />
    <g transform="${formatCurveFrameTransform(frame)}">
      <line x1="-28" y1="0" x2="28" y2="0" class="dxd-curvature-tangent" />
      <line x1="0" y1="-18" x2="0" y2="18" class="dxd-curvature-normal" />
      <circle cx="0" cy="0" r="14" class="dxd-curvature-tracer-ring" />
      <circle cx="0" cy="0" r="5" class="dxd-curvature-tracer" />
    </g>
  </g>`;
  };

  if (!animated) return staticInstrument("dxd-curvature-compass", representative);

  const samples = createAstroidArcLengthLookup(settings, 512)
    .map((sample) => ({
      ...sample,
      frame: getAstroidFrame(settings, sample.parameter),
    }));
  const formatTime = (value: number) => Number(value.toFixed(8)).toString();
  const keyTimes = samples.map((sample) => formatTime(sample.progress)).join(";");
  const values = (read: (frame: DxdCurveFrame) => number) =>
    samples.map((sample) => formatNumber(read(sample.frame))).join(";");
  const animate = (attributeName: string, read: (frame: DxdCurveFrame) => number) =>
    `<animate attributeName="${attributeName}" values="${values(read)}" keyTimes="${keyTimes}" dur="${formatNumber(duration)}s" calcMode="linear" fill="freeze" />`;
  const opacityValues = samples
    .map((sample) => {
      const quarterPosition = sample.parameter * 4;
      const cuspDistance = Math.abs(quarterPosition - Math.round(quarterPosition)) / 4;
      const linear = Math.min(1, cuspDistance / (1 / 64));
      const eased = linear * linear * (3 - 2 * linear);
      return formatNumber(eased);
    })
    .join(";");

  return `<g id="dxd-curvature-compass" aria-label="Animated variable-radius osculating compass on the exact drawing path">
    <circle id="dxd-osculating-circle" cx="0" cy="${formatNumber(start.signedCurvatureRadius)}" r="${formatNumber(start.curvatureRadius)}" class="dxd-curvature-circle">
      ${animate("cy", (frame) => frame.signedCurvatureRadius)}
      ${animate("r", (frame) => frame.curvatureRadius)}
    </circle>
    <line x1="0" y1="${formatNumber(start.signedCurvatureRadius)}" x2="0" y2="0" class="dxd-curvature-arm">
      ${animate("y1", (frame) => frame.signedCurvatureRadius)}
    </line>
    <circle cx="0" cy="${formatNumber(start.signedCurvatureRadius)}" r="6" class="dxd-curvature-pivot">
      ${animate("cy", (frame) => frame.signedCurvatureRadius)}
    </circle>
    <line x1="-28" y1="0" x2="28" y2="0" class="dxd-curvature-tangent" />
    <line x1="0" y1="-18" x2="0" y2="18" class="dxd-curvature-normal" />
    <circle cx="0" cy="0" r="14" class="dxd-curvature-tracer-ring" />
    <circle cx="0" cy="0" r="5" class="dxd-curvature-tracer" />
    <animate attributeName="opacity" values="${opacityValues}" keyTimes="${keyTimes}" dur="${formatNumber(duration)}s" calcMode="linear" fill="freeze" />
    <animateMotion dur="${formatNumber(duration)}s" path="${path}" calcMode="paced" rotate="auto" fill="freeze" />
  </g>
  ${staticInstrument("dxd-curvature-compass-reduced", representative)}`;
}

function renderConstruction(settings: DxdMarkSettings) {
  const geometry = getConstructionGeometry(settings.radius, settings.rotation);
  const { boundingBox } = geometry;
  const circles = geometry.rollingCircleCenters
    .map(
      (point) =>
        `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(geometry.rollingCircleRadius)}" class="dxd-rolling-circle" />`,
    )
    .join("");
  return `<g id="dxd-construction" aria-label="Rotated classical p3 astroid construction comparison">
    <circle cx="${DXD_CENTER}" cy="${DXD_CENTER}" r="${formatNumber(geometry.fixedCircleRadius)}" class="dxd-fixed-circle" />
    <rect x="${formatNumber(boundingBox.x)}" y="${formatNumber(boundingBox.y)}" width="${formatNumber(boundingBox.size)}" height="${formatNumber(boundingBox.size)}" class="dxd-bounds" />
    <g transform="rotate(${formatNumber(settings.rotation)} ${DXD_CENTER} ${DXD_CENTER})" aria-label="Local construction axes u and v">
      <line x1="100" y1="${DXD_CENTER}" x2="900" y2="${DXD_CENTER}" class="dxd-axis" />
      <line x1="${DXD_CENTER}" y1="100" x2="${DXD_CENTER}" y2="900" class="dxd-axis" />
    </g>
    ${circles}
  </g>`;
}

function renderControlPoints(settings: DxdMarkSettings) {
  const points = getConstructionGeometry(settings.radius, settings.rotation).cuspPoints
    .map(
      (point, index) =>
        `<circle id="dxd-cusp-${index + 1}" cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="7" class="dxd-control-point" />`,
    )
    .join("");

  return `<g id="dxd-control-points" aria-label="Four rotated cusp anchors">${points}</g>`;
}

function renderMath(settings: DxdMarkSettings) {
  const isMechanical = Math.abs(settings.sharpness - DXD_CLASSICAL_SHARPNESS) < DXD_LAW_TOLERANCE;
  const isBrandProfile = Math.abs(settings.sharpness - DXD_MASTER_SHARPNESS) < DXD_LAW_TOLERANCE;
  const isBrandMaster = isDxdMaster(settings);
  const isGolden = Math.abs(settings.sharpness - DXD_GOLDEN_SHARPNESS) < DXD_LAW_TOLERANCE;
  const waistRatio = getWaistRatio(settings.sharpness);
  const samples = generateAstroidPoints(settings, 64)
    .map(
      (point, index) =>
        `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${index % 8 === 0 ? 4.5 : 2.25}" class="dxd-sample-point${index % 8 === 0 ? " dxd-sample-major" : ""}" data-theta="${formatNumber((index / 64) * 360)}" />`,
    )
    .join("");
  const tickValues = [-1, -0.5, 0, 0.5, 1];
  const xTicks = tickValues
    .map((value) => {
      const x = DXD_CENTER + value * settings.radius;
      return `<g class="dxd-math-tick"><line x1="${formatNumber(x)}" y1="${DXD_CENTER - 7}" x2="${formatNumber(x)}" y2="${DXD_CENTER + 7}" /><text x="${formatNumber(x)}" y="${DXD_CENTER + 26}" text-anchor="middle">${formatNumber(value)}</text></g>`;
    })
    .join("");
  const yTicks = tickValues
    .filter((value) => value !== 0)
    .map((value) => {
      const y = DXD_CENTER + value * settings.radius;
      return `<g class="dxd-math-tick"><line x1="${DXD_CENTER - 7}" y1="${formatNumber(y)}" x2="${DXD_CENTER + 7}" y2="${formatNumber(y)}" /><text x="${DXD_CENTER - 16}" y="${formatNumber(y + 4)}" text-anchor="end">${formatNumber(-value)}</text></g>`;
    })
    .join("");
  const dimensionY = DXD_CENTER + settings.radius + 48;
  const rollingRadius = settings.radius / 4;
  const rollingCenterX = DXD_CENTER + settings.radius - rollingRadius;
  const modelExponent = 2 / settings.sharpness;
  const modelLabel = isMechanical
    ? "HYPOCYCLOID / EXACT CIRCLE"
    : isBrandMaster
      ? "DXD CANONICAL QUARTIC / 1:2 WAIST"
      : isBrandProfile
        ? "DXD P4 PROFILE / ROTATED VARIANT"
        : isGolden
          ? "GOLDEN WAIST / 1:PHI REFERENCE"
          : "DERIVED WAIST / CURVATURE COMPASS";
  const ratioLine = isMechanical
    ? `r = R / 4 = ${formatNumber(rollingRadius)}`
    : `n = 2 / p = ${formatNumber(modelExponent)}`;
  const classificationLine = isMechanical
    ? "R:r = 4:1 / C4"
    : isBrandMaster
      ? `W/B = ${formatNumber(waistRatio)} / 1:2 / C4`
      : isGolden
        ? `W/B = ${formatNumber(waistRatio)} / 1:PHI / C4`
        : `W/B = ${formatNumber(waistRatio)} / C4`;
  const implicitLine = isBrandProfile
    ? `<text x="126" y="226" class="dxd-math-value">√(|u|/R) + √(|v|/R) = 1</text>`
    : "";
  const rollingRadiusMeasure = isMechanical
    ? `<g transform="rotate(${formatNumber(settings.rotation)} ${DXD_CENTER} ${DXD_CENTER})">
        <line x1="${formatNumber(rollingCenterX)}" y1="${DXD_CENTER}" x2="${formatNumber(DXD_CENTER + settings.radius)}" y2="${DXD_CENTER}" class="dxd-dimension dxd-dimension-amber" />
        <text x="${formatNumber(rollingCenterX + rollingRadius / 2)}" y="${DXD_CENTER - 12}" text-anchor="middle" class="dxd-dimension-label dxd-dimension-label-amber">r = ${formatNumber(rollingRadius)}</text>
      </g>`
    : "";

  return `<g id="dxd-math" aria-label="Parametric construction notation">
    <g id="dxd-equations" class="dxd-math-copy">
      <text x="126" y="124" class="dxd-math-kicker">DXD / PARAMETRIC FIELD</text>
      <text x="126" y="151">u(θ) = R·sgn(cosθ)·|cosθ|^p</text>
      <text x="126" y="176">v(θ) = R·sgn(sinθ)·|sinθ|^p</text>
      <text x="126" y="201" class="dxd-math-value">p = ${formatNumber(settings.sharpness)} / α = ${formatNumber(settings.rotation)}°</text>
      ${implicitLine}
    </g>
    <g id="dxd-ratio" class="dxd-math-copy" text-anchor="end">
      <text x="874" y="124" class="dxd-math-kicker">${modelLabel}</text>
      <text x="874" y="151">R = ${formatNumber(settings.radius)}</text>
      <text x="874" y="176">${ratioLine}</text>
      <text x="874" y="201" class="dxd-math-value">${classificationLine} / 64 SAMPLES</text>
    </g>
    <g id="dxd-normalized-axes" transform="rotate(${formatNumber(settings.rotation)} ${DXD_CENTER} ${DXD_CENTER})" aria-label="Rotated local coordinate ticks u and v">${xTicks}${yTicks}</g>
    <g id="dxd-radius-measure" aria-label="Radius measurements">
      <line x1="${DXD_CENTER}" y1="${formatNumber(dimensionY)}" x2="${formatNumber(DXD_CENTER + settings.radius)}" y2="${formatNumber(dimensionY)}" class="dxd-dimension" />
      <line x1="${DXD_CENTER}" y1="${formatNumber(dimensionY - 9)}" x2="${DXD_CENTER}" y2="${formatNumber(dimensionY + 9)}" class="dxd-dimension" />
      <line x1="${formatNumber(DXD_CENTER + settings.radius)}" y1="${formatNumber(dimensionY - 9)}" x2="${formatNumber(DXD_CENTER + settings.radius)}" y2="${formatNumber(dimensionY + 9)}" class="dxd-dimension" />
      <text x="${formatNumber(DXD_CENTER + settings.radius / 2)}" y="${formatNumber(dimensionY - 12)}" text-anchor="middle" class="dxd-dimension-label">R = ${formatNumber(settings.radius)}</text>
      ${rollingRadiusMeasure}
    </g>
    <g id="dxd-parametric-samples" aria-label="64 parametric samples">${samples}</g>
  </g>`;
}

function renderStaticMark(path: string, settings: DxdMarkSettings) {
  if (settings.treatment === "outline") {
    return `<path id="dxd-mark" d="${path}" fill="none" stroke="${settings.color}" stroke-width="${formatNumber(settings.strokeWidth)}" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`;
  }

  return `<path id="dxd-mark" d="${path}" fill="${settings.color}" />`;
}

function renderAnimatedMark(
  path: string,
  tracePath: string,
  settings: DxdMarkSettings,
  animationMode: DxdAnimationMode,
) {
  if (animationMode === "reveal") {
    const mark = renderStaticMark(path, settings).replace('id="dxd-mark"', 'id="dxd-mark" clip-path="url(#dxd-reveal)"');
    return `<defs><clipPath id="dxd-reveal"><rect class="dxd-reveal-shape" x="0" y="0" width="${DXD_VIEWBOX_SIZE}" height="${DXD_VIEWBOX_SIZE}" /></clipPath></defs>${mark}`;
  }

  if (settings.treatment === "outline") {
    return `<path id="dxd-mark" class="dxd-mark-draw" pathLength="1" d="${tracePath}" fill="none" stroke="${settings.color}" stroke-width="${formatNumber(settings.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  return `<g id="dxd-mark">
    <path class="dxd-mark-fill" d="${path}" fill="${settings.color}" />
    <path class="dxd-mark-draw" pathLength="1" d="${tracePath}" fill="none" stroke="${settings.color}" stroke-width="${formatNumber(Math.max(4, settings.strokeWidth))}" stroke-linecap="round" stroke-linejoin="round" />
  </g>`;
}

function renderCompassKeyframes(settings: DxdMarkSettings) {
  const lookup = createAstroidArcLengthLookup(
    { sharpness: DXD_CLASSICAL_SHARPNESS, radius: settings.radius, rotation: 0 },
    256,
  );
  const formatPercent = (value: number) => Number(value.toFixed(6)).toString();
  const orbit = lookup
    .map(
      (sample) =>
        `${formatPercent(sample.progress * 100)}% { transform: rotate(${formatNumber(settings.rotation + sample.parameter * 360)}deg); }`,
    )
    .join(" ");
  const spin = lookup
    .map(
      (sample) =>
        `${formatPercent(sample.progress * 100)}% { transform: rotate(${formatNumber(sample.parameter * -1440)}deg); }`,
    )
    .join(" ");

  return `@keyframes dxd-compass-orbit { ${orbit} }
    @keyframes dxd-compass-spin { ${spin} }`;
}

function renderStyles(
  duration: number,
  animated: boolean,
  settings: DxdMarkSettings,
  includeCompass: boolean,
  includeMath: boolean,
) {
  const safeDuration = Math.min(12, Math.max(0.4, duration));
  const compassGeometry = getConstructionGeometry(settings.radius);
  const rollingCenterX = DXD_CENTER + compassGeometry.fixedCircleRadius - compassGeometry.rollingCircleRadius;
  const animationStyles = animated
    ? `
    @keyframes dxd-guide-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes dxd-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
    @keyframes dxd-fill { 0%, 72% { opacity: 0; } 100% { opacity: 1; } }
    @keyframes dxd-reveal { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes dxd-math-in { from { opacity: 0; } to { opacity: 1; } }
    ${renderCompassKeyframes(settings)}
    #dxd-grid { opacity: 0; animation: dxd-guide-in ${formatNumber(safeDuration * 0.2)}s ease-out forwards; }
    #dxd-polar-grid, #dxd-ratio-grid, #dxd-kinematic-grid, #dxd-phi-grid { opacity: 0; animation: dxd-guide-in ${formatNumber(safeDuration * 0.22)}s ease-out forwards; }
    #dxd-construction { opacity: 0; animation: dxd-guide-in ${formatNumber(safeDuration * 0.25)}s ${formatNumber(safeDuration * 0.12)}s ease-out forwards; }
    .dxd-mark-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dxd-draw ${formatNumber(safeDuration)}s linear forwards; }
    .dxd-mark-fill { opacity: 0; animation: dxd-fill ${formatNumber(safeDuration)}s ease-out forwards; }
    .dxd-reveal-shape { transform: scaleX(0); transform-origin: 0 0; animation: dxd-reveal ${formatNumber(safeDuration)}s cubic-bezier(.65,0,.35,1) forwards; }
    ${includeMath ? `#dxd-math { opacity: 0; animation: dxd-math-in ${formatNumber(safeDuration * 0.28)}s ${formatNumber(safeDuration * 0.18)}s ease-out forwards; }` : ""}
    ${includeCompass ? `.dxd-compass-orbit { animation: dxd-compass-orbit ${formatNumber(safeDuration)}s linear forwards; }
    .dxd-compass-spin { animation: dxd-compass-spin ${formatNumber(safeDuration)}s linear forwards; }` : ""}
    @media (prefers-reduced-motion: reduce) {
      #dxd-grid, #dxd-polar-grid, #dxd-ratio-grid, #dxd-kinematic-grid, #dxd-phi-grid, #dxd-construction, #dxd-math, .dxd-mark-draw, .dxd-mark-fill, .dxd-reveal-shape, .dxd-compass-orbit, .dxd-compass-spin { animation: none; opacity: 1; stroke-dashoffset: 0; }
      .dxd-reveal-shape { transform: scaleX(1); }
    }`
    : "";

  return `<style>
    .dxd-grid-minor { stroke: #777b84; stroke-width: .75; opacity: .22; vector-effect: non-scaling-stroke; }
    .dxd-grid-major { stroke: #b0b4ba; stroke-width: 1; opacity: .38; vector-effect: non-scaling-stroke; }
    .dxd-polar-minor { fill: none; stroke: #8d98a7; stroke-width: .75; opacity: .2; vector-effect: non-scaling-stroke; }
    .dxd-polar-major { fill: none; stroke: #bdee63; stroke-width: 1; opacity: .4; vector-effect: non-scaling-stroke; }
    .dxd-ratio-bound, .dxd-ratio-diagonal, .dxd-ratio-waist, .dxd-ratio-circle, .dxd-ratio-measure { fill: none; stroke: #bdee63; vector-effect: non-scaling-stroke; }
    .dxd-ratio-bound { stroke-width: 1.1; opacity: .58; }
    .dxd-ratio-diagonal { stroke-width: .75; stroke-dasharray: 4 7; opacity: .28; }
    .dxd-ratio-waist { stroke-width: 1.25; stroke-dasharray: 6 5; opacity: .72; }
    .dxd-ratio-circle { stroke-width: .75; opacity: .34; }
    .dxd-ratio-measure { stroke-width: 1; opacity: .7; }
    .dxd-ratio-label { fill: #bdee63; }
    .dxd-center-locus { fill: none; stroke: #bdee63; stroke-width: 1.25; stroke-dasharray: 5 7; opacity: .58; vector-effect: non-scaling-stroke; }
    .dxd-kinematic-station line, .dxd-kinematic-station circle { fill: none; stroke: #bde56c; stroke-width: .75; opacity: .2; vector-effect: non-scaling-stroke; }
    .dxd-kinematic-station .dxd-kinematic-center { fill: #bdee63; stroke: none; opacity: .72; }
    .dxd-grid-label { fill: #bde56c; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 8px; letter-spacing: .1em; }
    .dxd-phi-bound, .dxd-phi-line, .dxd-phi-circle { fill: none; stroke: #ffc53d; stroke-width: 1; stroke-dasharray: 3 6; opacity: .5; vector-effect: non-scaling-stroke; }
    .dxd-phi-label { fill: #ffc53d; }
    .dxd-fixed-circle { fill: none; stroke: #0090ff; stroke-width: 1.5; opacity: .7; vector-effect: non-scaling-stroke; }
    .dxd-rolling-circle { fill: none; stroke: #ffc53d; stroke-width: 1.25; stroke-dasharray: 8 8; opacity: .34; vector-effect: non-scaling-stroke; }
    .dxd-bounds, .dxd-axis { fill: none; stroke: #777b84; stroke-width: 1; opacity: .65; vector-effect: non-scaling-stroke; }
    .dxd-control-point { fill: #edeef0; stroke: #111113; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dxd-compass-orbit { transform-box: view-box; transform-origin: ${DXD_CENTER}px ${DXD_CENTER}px; transform: rotate(${formatNumber(settings.rotation)}deg); }
    .dxd-compass-spin { transform-box: view-box; transform-origin: ${formatNumber(rollingCenterX)}px ${DXD_CENTER}px; }
    .dxd-compass-circle { fill: #16120c; fill-opacity: .72; stroke: #ffc53d; stroke-width: 2.25; vector-effect: non-scaling-stroke; }
    .dxd-compass-diameter, .dxd-compass-cross { stroke: #8f6424; stroke-width: 1; opacity: .78; vector-effect: non-scaling-stroke; }
    .dxd-compass-arm { stroke: #ffca16; stroke-width: 2.25; vector-effect: non-scaling-stroke; }
    .dxd-compass-pivot { fill: #ffc53d; stroke: #111113; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dxd-compass-tracer { fill: ${settings.color}; stroke: #edeef0; stroke-width: 2.5; vector-effect: non-scaling-stroke; }
    .dxd-curvature-circle { fill: none; stroke: #bdee63; stroke-width: 1.5; stroke-dasharray: 8 7; opacity: .42; vector-effect: non-scaling-stroke; }
    .dxd-curvature-arm { stroke: #bdee63; stroke-width: 1.75; opacity: .86; vector-effect: non-scaling-stroke; }
    .dxd-curvature-alternate { opacity: .22; }
    .dxd-curvature-pivot { fill: #bdee63; stroke: #111113; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dxd-curvature-tangent { stroke: #bdee63; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .dxd-curvature-normal { stroke: #777b84; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .dxd-curvature-tracer-ring { fill: #11130c; fill-opacity: .82; stroke: #bdee63; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dxd-curvature-tracer { fill: ${settings.color}; stroke: #edeef0; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    #dxd-curvature-compass-reduced { display: none; }
    .dxd-math-copy, .dxd-math-tick, .dxd-dimension-label { fill: #b0b4ba; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; letter-spacing: .04em; }
    .dxd-math-kicker { fill: #bde56c; font-size: 9px; font-weight: 700; letter-spacing: .16em; }
    .dxd-math-value { fill: #777b84; font-size: 10px; }
    .dxd-math-tick line, .dxd-dimension { fill: none; stroke: #777b84; stroke-width: 1; opacity: .72; vector-effect: non-scaling-stroke; }
    .dxd-math-tick text { fill: #777b84; font-size: 9px; }
    .dxd-dimension-label { font-size: 9px; fill: #bde56c; }
    .dxd-dimension-amber { stroke: #ffc53d; opacity: .8; }
    .dxd-dimension-label-amber { fill: #ffc53d; }
    .dxd-sample-point { fill: #b0b4ba; opacity: .56; }
    .dxd-sample-major { fill: #bdee63; opacity: .92; }
    ${animated ? "@media (prefers-reduced-motion: reduce) { #dxd-curvature-compass { display: none; } #dxd-curvature-compass-reduced { display: inline; } }" : ""}
    ${animationStyles}
  </style>`;
}

export function buildDxdSvg(settings: DxdMarkSettings, options: DxdExportOptions) {
  const normalizedSettings = {
    ...settings,
    sharpness: Math.min(DXD_MASTER_SHARPNESS, Math.max(DXD_CLASSICAL_SHARPNESS, settings.sharpness)),
    radius: Math.min(330, Math.max(180, settings.radius)),
    rotation: Math.min(45, Math.max(0, settings.rotation)),
    color: normalizeHexColor(settings.color),
    strokeWidth: Math.min(40, Math.max(2, settings.strokeWidth)),
  } satisfies DxdMarkSettings;
  const duration = Math.min(12, Math.max(0.4, options.duration));
  const path = createAstroidPath(normalizedSettings);
  const tracePath = createAstroidPath(normalizedSettings, 64, false);
  const brandMaster = isDxdMaster(normalizedSettings);
  const brandProfile = Math.abs(normalizedSettings.sharpness - DXD_MASTER_SHARPNESS) < DXD_LAW_TOLERANCE;
  const mechanicalProfile = Math.abs(normalizedSettings.sharpness - DXD_CLASSICAL_SHARPNESS) < DXD_LAW_TOLERANCE;
  const goldenProfile = Math.abs(normalizedSettings.sharpness - DXD_GOLDEN_SHARPNESS) < DXD_LAW_TOLERANCE;
  const waistRatio = getWaistRatio(normalizedSettings.sharpness);
  const metadata = escapeXml(
    JSON.stringify({
      generator: "DXD Mark Lab",
      version: 6,
      equation: "x=a*sign(cos(t))*abs(cos(t))^p; y=a*sign(sin(t))*abs(sin(t))^p",
      law: brandMaster
        ? "DXD canonical 1:2 waist"
        : mechanicalProfile
          ? "Mechanical p3 hypocycloid"
          : goldenProfile
            ? "Golden-waist comparator"
            : "Custom cusp-box waist",
      waist: {
        ratio: waistRatio,
        expression: "W/B=2^(1-p/2)",
        inverse: "p=2-2*log2(W/B)",
      },
      instrument: mechanicalProfile
        ? "fixed R/4 rolling-circle mechanism"
        : "variable-radius osculating curvature compass",
      curvatureSampling: mechanicalProfile ? null : 512,
      motionFallback: "complete static mark and representative instrument pose",
      geometry:
        brandMaster
          ? "DXD canonical quartic: p=4, exact 1:2 waist, rotated 45 degrees"
          : brandProfile
            ? `DXD p4 profile variant: rotated ${formatNumber(normalizedSettings.rotation)} degrees`
          : mechanicalProfile
            ? "Classical p=3 astroid: exact 4:1 hypocycloid"
            : "Custom concave superellipse",
      settings: normalizedSettings,
      export: { ...options, duration },
    }),
  );
  const background = options.background
    ? `<rect id="dxd-background" width="${DXD_VIEWBOX_SIZE}" height="${DXD_VIEWBOX_SIZE}" fill="${normalizeHexColor(options.background, "#111113")}" />`
    : "";
  const grid = options.includeGrid ? renderGrid() : "";
  const polarGrid = options.includePolarGrid ? renderPolarGrid(normalizedSettings.radius) : "";
  const ratioGrid = options.includeRatioGrid ? renderRatioGrid(normalizedSettings) : "";
  const kinematicGrid = options.includeKinematicGrid
    ? renderKinematicGrid(normalizedSettings)
    : "";
  const phiGrid = options.includePhiGrid ? renderPhiGrid(normalizedSettings.radius) : "";
  const isMechanical = mechanicalProfile;
  const tracerMatchesAnimation = !options.includeAnimation || options.animationMode === "draw";
  const includeCompass = options.includeCompass && isMechanical && tracerMatchesAnimation;
  const includeCurvatureCompass = options.includeCompass && !isMechanical && tracerMatchesAnimation;
  const construction = options.includeConstruction
    ? renderConstruction(normalizedSettings)
    : "";
  const compass = includeCompass ? renderCompass(normalizedSettings) : "";
  const controlPoints = options.includeControlPoints ? renderControlPoints(normalizedSettings) : "";
  const mark = options.includeAnimation
    ? renderAnimatedMark(path, tracePath, normalizedSettings, options.animationMode)
    : renderStaticMark(path, normalizedSettings);
  const math = options.includeMath ? renderMath(normalizedSettings) : "";
  const curvatureCompass = includeCurvatureCompass
    ? renderCurvatureCompass(tracePath, normalizedSettings, duration, options.includeAnimation)
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DXD_VIEWBOX_SIZE} ${DXD_VIEWBOX_SIZE}" role="img" aria-labelledby="dxd-title dxd-description" shape-rendering="geometricPrecision">
  <title id="dxd-title">DXD four-cusp mark</title>
  <desc id="dxd-description">Parametric DXD brand mark with optional Cartesian, polar, measured-ratio, kinematic, and golden-ratio grids, mathematical notation, a fixed p3 rolling compass or variable-radius curvature compass, and self-contained animation.</desc>
  <metadata>${metadata}</metadata>
  ${renderStyles(duration, options.includeAnimation, normalizedSettings, includeCompass, options.includeMath)}
  ${background}
  ${grid}
  ${polarGrid}
  ${ratioGrid}
  ${kinematicGrid}
  ${phiGrid}
  ${construction}
  ${compass}
  ${controlPoints}
  ${mark}
  ${curvatureCompass}
  ${math}
</svg>`;
}
