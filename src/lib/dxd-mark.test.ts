import { describe, expect, it } from "vitest";

import {
  buildDxdSvg,
  createAstroidArcLengthLookup,
  createAstroidPath,
  DXD_CENTER,
  DXD_CLASSICAL_SHARPNESS,
  DXD_GOLDEN_SHARPNESS,
  DXD_GOLDEN_WAIST_RATIO,
  DXD_MASTER_ROTATION,
  DXD_MASTER_SHARPNESS,
  formatCurveFrameTransform,
  generateAstroidPoints,
  getAstroidFrame,
  getAstroidPoint,
  getCompassState,
  getConstructionGeometry,
  getParameterAtArcProgress,
  getSharpnessFromWaistRatio,
  getWaistRatio,
  isDxdMaster,
  type DxdExportOptions,
  type DxdMarkSettings,
} from "./dxd-mark";

const settings: DxdMarkSettings = {
  sharpness: DXD_CLASSICAL_SHARPNESS,
  radius: 300,
  rotation: 0,
  color: "#bdee63",
  treatment: "solid",
  strokeWidth: 12,
};

const masterSettings: DxdMarkSettings = {
  ...settings,
  sharpness: DXD_MASTER_SHARPNESS,
  rotation: DXD_MASTER_ROTATION,
};

const options: DxdExportOptions = {
  includeGrid: true,
  includePolarGrid: true,
  includeRatioGrid: true,
  includeKinematicGrid: true,
  includePhiGrid: true,
  includeConstruction: true,
  includeCompass: true,
  includeControlPoints: true,
  includeMath: true,
  includeAnimation: true,
  animationMode: "draw",
  duration: 2.8,
  background: null,
};

describe("DXD astroid geometry", () => {
  it("lands exactly on all four cardinal cusps", () => {
    const points = generateAstroidPoints(settings, 512);

    expect(points[0]).toEqual({ x: 800, y: 500 });
    expect(points[128].x).toBeCloseTo(500, 10);
    expect(points[128].y).toBeCloseTo(800, 10);
    expect(points[256].x).toBeCloseTo(200, 10);
    expect(points[256].y).toBeCloseTo(500, 10);
    expect(points[384].x).toBeCloseTo(500, 10);
    expect(points[384].y).toBeCloseTo(200, 10);
  });

  it("satisfies the classical implicit astroid equation at p3", () => {
    const points = generateAstroidPoints(settings, 128);

    for (const point of points) {
      const normalizedX = Math.abs(point.x - DXD_CENTER) / settings.radius;
      const normalizedY = Math.abs(point.y - DXD_CENTER) / settings.radius;
      const implicitValue = normalizedX ** (2 / 3) + normalizedY ** (2 / 3);
      expect(implicitValue).toBeCloseTo(1, 10);
    }
  });

  it("defines the canonical DXD master as a 45-degree p4 concave superellipse", () => {
    const points = generateAstroidPoints(masterSettings, 128);
    const radians = (masterSettings.rotation * Math.PI) / 180;

    for (const point of points) {
      const x = point.x - DXD_CENTER;
      const y = point.y - DXD_CENTER;
      const localX = x * Math.cos(radians) + y * Math.sin(radians);
      const localY = -x * Math.sin(radians) + y * Math.cos(radians);
      const implicitValue =
        Math.sqrt(Math.abs(localX) / masterSettings.radius) +
        Math.sqrt(Math.abs(localY) / masterSettings.radius);
      expect(implicitValue).toBeCloseTo(1, 7);
    }

    expect(points[0].x).toBeCloseTo(500 + 300 / Math.sqrt(2), 10);
    expect(points[0].y).toBeCloseTo(500 + 300 / Math.sqrt(2), 10);
  });

  it("derives the three construction families from a measurable waist law", () => {
    const phi = (1 + Math.sqrt(5)) / 2;

    expect(getWaistRatio(DXD_CLASSICAL_SHARPNESS)).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(getWaistRatio(DXD_MASTER_SHARPNESS)).toBeCloseTo(0.5, 12);
    expect(DXD_GOLDEN_WAIST_RATIO).toBeCloseTo(1 / phi, 12);
    expect(getWaistRatio(DXD_GOLDEN_SHARPNESS)).toBeCloseTo(1 / phi, 12);
    expect(getSharpnessFromWaistRatio(0.5)).toBeCloseTo(4, 12);
    expect(getSharpnessFromWaistRatio(1 / phi)).toBeCloseTo(DXD_GOLDEN_SHARPNESS, 12);
    expect(() => getSharpnessFromWaistRatio(0)).toThrow(RangeError);
  });

  it("measures the canonical 1:2 waist directly from generated coordinates", () => {
    const cusp = getAstroidPoint(masterSettings, 0);
    const waist = getAstroidPoint(masterSettings, 0.125);
    const cuspBoxHalfSide = cusp.x - DXD_CENTER;
    const waistDistance = waist.y - DXD_CENTER;

    expect(cuspBoxHalfSide).toBeCloseTo(masterSettings.radius / Math.sqrt(2), 10);
    expect(waist.x).toBeCloseTo(DXD_CENTER, 10);
    expect(waistDistance / cuspBoxHalfSide).toBeCloseTo(0.5, 10);
  });

  it("preserves central symmetry for every sampled point", () => {
    const points = generateAstroidPoints({ ...settings, sharpness: 2.65 }, 256);

    for (let index = 0; index < points.length / 2; index += 1) {
      expect(points[index].x + points[index + 128].x).toBeCloseTo(DXD_CENTER * 2, 10);
      expect(points[index].y + points[index + 128].y).toBeCloseTo(DXD_CENTER * 2, 10);
    }
  });

  it("returns a precise live coordinate for normalized progress", () => {
    const quarter = getAstroidPoint(settings, 0.25);
    const bounded = getAstroidPoint(settings, 2);

    expect(quarter.x).toBeCloseTo(500, 10);
    expect(quarter.y).toBeCloseTo(800, 10);
    expect(bounded.x).toBeCloseTo(800, 10);
    expect(bounded.y).toBeCloseTo(500, 10);
  });

  it("emits an editable cubic path without dense line segments", () => {
    const path = createAstroidPath(settings);

    expect(path.match(/ C /g)).toHaveLength(64);
    expect(path).not.toContain(" L ");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("uses the classical 4:1 hypocycloid construction", () => {
    const geometry = getConstructionGeometry(300);

    expect(geometry.fixedCircleRadius).toBe(300);
    expect(geometry.rollingCircleRadius).toBe(75);
    expect(geometry.fixedCircleRadius / geometry.rollingCircleRadius).toBe(4);
    expect(geometry.rollingCircleCenters[0]).toEqual({ x: 725, y: 500 });
  });

  it("rotates construction anchors with the selected mark angle", () => {
    const geometry = getConstructionGeometry(300, DXD_MASTER_ROTATION);

    expect(geometry.cuspPoints[0].x).toBeCloseTo(500 + 300 / Math.sqrt(2), 10);
    expect(geometry.cuspPoints[0].y).toBeCloseTo(500 + 300 / Math.sqrt(2), 10);
    expect(geometry.rollingCircleCenters[0].x).toBeCloseTo(500 + 225 / Math.sqrt(2), 10);
    expect(geometry.rollingCircleCenters[0].y).toBeCloseTo(500 + 225 / Math.sqrt(2), 10);
  });

  it("returns an orthonormal tangent frame centered exactly on the p4 path", () => {
    const frame = getAstroidFrame(masterSettings, 0.137);
    const point = getAstroidPoint(masterSettings, 0.137);
    const tangentLength = Math.hypot(frame.tangent.x, frame.tangent.y);
    const normalLength = Math.hypot(frame.normal.x, frame.normal.y);
    const dot = frame.tangent.x * frame.normal.x + frame.tangent.y * frame.normal.y;

    expect(frame.point.x).toBeCloseTo(point.x, 10);
    expect(frame.point.y).toBeCloseTo(point.y, 10);
    expect(tangentLength).toBeCloseTo(1, 10);
    expect(normalLength).toBeCloseTo(1, 10);
    expect(dot).toBeCloseTo(0, 10);
  });

  it("uses the inward radial tangent at each singular p4 tip", () => {
    const frame = getAstroidFrame(masterSettings, 0);
    const inwardLength = Math.hypot(
      DXD_CENTER - frame.point.x,
      DXD_CENTER - frame.point.y,
    );
    const inward = {
      x: (DXD_CENTER - frame.point.x) / inwardLength,
      y: (DXD_CENTER - frame.point.y) / inwardLength,
    };

    expect(frame.tangent.x).toBeCloseTo(inward.x, 5);
    expect(frame.tangent.y).toBeCloseTo(inward.y, 5);
    expect(frame.angleDegrees).toBeCloseTo(-135, 3);
  });

  it("serializes the live frame identically across server and browser runtimes", () => {
    const frame = getAstroidFrame(masterSettings, 1);

    expect(formatCurveFrameTransform(frame)).toBe(
      "translate(712.132 712.132) rotate(-135)",
    );
  });

  it("returns stable open-arc curvature and both one-sided quartic cusp circles", () => {
    const tip = getAstroidFrame(masterSettings, 0);
    const waist = getAstroidFrame(masterSettings, 0.125);
    const nearTip = getAstroidFrame(masterSettings, 1e-8);
    const tipCenterDistance = Math.hypot(
      tip.curvatureCenter.x - tip.point.x,
      tip.curvatureCenter.y - tip.point.y,
    );
    const waistCenterDistance = Math.hypot(
      waist.curvatureCenter.x - waist.point.x,
      waist.curvatureCenter.y - waist.point.y,
    );
    const waistArm = {
      x: waist.point.x - waist.curvatureCenter.x,
      y: waist.point.y - waist.curvatureCenter.y,
    };

    expect(tip.curvatureRadius).toBeCloseTo(masterSettings.radius * 2, 4);
    expect(waist.curvatureRadius).toBeCloseTo(masterSettings.radius / Math.sqrt(2), 4);
    expect(nearTip.signedCurvature).toBeCloseTo(-1 / (masterSettings.radius * 2), 10);
    expect(tip.atCusp).toBe(true);
    expect(tip.alternateCurvatureCenter).not.toBeNull();
    expect(
      (tip.curvatureCenter.x + (tip.alternateCurvatureCenter?.x ?? 0)) / 2,
    ).toBeCloseTo(tip.point.x, 8);
    expect(
      (tip.curvatureCenter.y + (tip.alternateCurvatureCenter?.y ?? 0)) / 2,
    ).toBeCloseTo(tip.point.y, 8);
    expect(tipCenterDistance).toBeCloseTo(tip.curvatureRadius, 8);
    expect(waistCenterDistance).toBeCloseTo(waist.curvatureRadius, 8);
    expect(waistArm.x * waist.tangent.x + waistArm.y * waist.tangent.y).toBeCloseTo(0, 8);
  });

  it("moves the compass tracer along the classical p3 astroid", () => {
    const start = getCompassState(300, 0);
    const quarter = getCompassState(300, 0.25);

    expect(start.center).toEqual({ x: 725, y: 500 });
    expect(start.tracer).toEqual({ x: 800, y: 500 });
    expect(quarter.center.x).toBeCloseTo(500, 10);
    expect(quarter.center.y).toBeCloseTo(725, 10);
    expect(quarter.tracer.x).toBeCloseTo(500, 10);
    expect(quarter.tracer.y).toBeCloseTo(800, 10);
    expect(quarter.spinDegrees).toBe(-360);
  });

  it("converts drawn arc length to the compass parameter so both endpoints coincide", () => {
    const lookup = createAstroidArcLengthLookup(settings);
    const parameter = getParameterAtArcProgress(lookup, 0.05);
    const compass = getCompassState(settings.radius, parameter);
    const pathPoint = getAstroidPoint(settings, parameter);
    const exactFirstQuadrantParameter = Math.asin(Math.sqrt(0.2)) / (Math.PI * 2);

    expect(parameter).toBeCloseTo(exactFirstQuadrantParameter, 4);
    expect(compass.tracer.x).toBeCloseTo(pathPoint.x, 6);
    expect(compass.tracer.y).toBeCloseTo(pathPoint.y, 6);
  });

  it("resizes the full compass mechanism from the master radius", () => {
    const compact = getCompassState(220, 0);

    expect(compact.rollingCircleRadius).toBe(55);
    expect(compact.center).toEqual({ x: 665, y: 500 });
    expect(compact.tracer).toEqual({ x: 720, y: 500 });
  });
});

describe("DXD SVG export", () => {
  it("uses an open subpath for the animated pen trace", () => {
    const svg = buildDxdSvg(masterSettings, options);
    const traceElement = svg.match(/<path[^>]*class="dxd-mark-draw"[^>]*\/>/)?.[0];
    const tracePath = traceElement?.match(/d="([^"]+)"/)?.[1];

    expect(tracePath).toBeDefined();
    expect(tracePath?.trim().endsWith("Z")).toBe(false);
    expect(traceElement).not.toContain('vector-effect="non-scaling-stroke"');
  });

  it("packages editable layers, settings metadata, and animation", () => {
    const svg = buildDxdSvg(settings, options);

    expect(svg).toContain('id="dxd-grid"');
    expect(svg).toContain('id="dxd-polar-grid"');
    expect(svg).toContain('id="dxd-ratio-grid"');
    expect(svg).toContain('id="dxd-kinematic-grid"');
    expect(svg).toContain('id="dxd-phi-grid"');
    expect(svg).toContain('id="dxd-construction"');
    expect(svg).toContain('id="dxd-compass"');
    expect(svg).toContain('id="dxd-mark"');
    expect(svg).toContain('id="dxd-math"');
    expect(svg).toContain('id="dxd-parametric-samples"');
    expect(svg).toContain("u(θ) = R·sgn(cosθ)·|cosθ|^p");
    expect(svg).toContain("R = 300");
    expect(svg).toContain("r = R / 4 = 75");
    expect(svg).toContain("@keyframes dxd-draw");
    expect(svg).toContain("@keyframes dxd-math-in");
    expect(svg).toContain("@keyframes dxd-compass-orbit");
    expect(svg).toContain("@keyframes dxd-compass-spin");
    expect(svg).toContain("animation: dxd-draw 2.8s linear forwards");
    expect(svg).toContain('pathLength="1"');
    expect(svg).toContain("&quot;sharpness&quot;:3");
    expect(svg).not.toContain('id="dxd-background"');
  });

  it("can emit a static, mark-only production asset", () => {
    const svg = buildDxdSvg(settings, {
      ...options,
      includeGrid: false,
      includePolarGrid: false,
      includeRatioGrid: false,
      includeKinematicGrid: false,
      includePhiGrid: false,
      includeConstruction: false,
      includeControlPoints: false,
      includeMath: false,
      includeAnimation: false,
    });

    expect(svg).not.toContain('id="dxd-grid"');
    expect(svg).not.toContain('id="dxd-construction"');
    expect(svg).not.toContain('id="dxd-math"');
    expect(svg).not.toContain("@keyframes dxd-draw");
    expect(svg).toContain('fill="#bdee63"');
  });

  it("exports a path-true variable-radius compass for the p4 master", () => {
    const svg = buildDxdSvg(masterSettings, options);

    expect(svg).not.toContain('id="dxd-compass"');
    expect(svg).toContain('id="dxd-curvature-compass"');
    expect(svg).toContain('id="dxd-osculating-circle"');
    expect(svg).toContain("<animateMotion");
    expect(svg).toContain('rotate="auto"');
    expect(svg).toContain('attributeName="r"');
    expect(svg).toContain('attributeName="opacity"');
    expect(svg).toContain('class="dxd-curvature-tangent"');
    expect(svg).toContain("DXD CANONICAL QUARTIC / 1:2 WAIST");
    expect(svg).toContain("n = 2 / p = 0.5");
    expect(svg).toContain("W/B = 0.5 / 1:2");
    expect(svg).not.toContain("r = R / 4 = 75");
    expect(svg).toContain("DXD canonical quartic: p=4, exact 1:2 waist, rotated 45 degrees");
    expect(svg).toContain('id="dxd-normalized-axes" transform="rotate(45 500 500)"');

    const keyTimes = svg.match(/keyTimes="([^"]+)"/)?.[1]
      .split(";")
      .map(Number);
    expect(keyTimes).toBeDefined();
    expect(keyTimes?.every((value, index) => index === 0 || value > keyTimes[index - 1])).toBe(true);
  });

  it("uses a visible waist pose for a static curvature-compass export", () => {
    const svg = buildDxdSvg(masterSettings, {
      ...options,
      includeAnimation: false,
    });

    expect(svg).toContain('id="dxd-osculating-circle"');
    expect(svg).toContain('r="212.132" class="dxd-curvature-circle"');
    expect(svg).not.toContain("<animateMotion");
  });

  it("reserves the master classification for the p4 profile at 45 degrees", () => {
    expect(isDxdMaster(masterSettings)).toBe(true);
    expect(isDxdMaster({ ...masterSettings, rotation: 0 })).toBe(false);

    const svg = buildDxdSvg({ ...masterSettings, rotation: 0 }, options);
    expect(svg).toContain("DXD p4 profile variant: rotated 0 degrees");
    expect(svg).not.toContain("DXD canonical quartic: p=4, exact 1:2 waist, rotated 45 degrees");
  });

  it("omits perimeter tracers from animated horizontal wipe exports", () => {
    const p4Svg = buildDxdSvg(masterSettings, {
      ...options,
      animationMode: "reveal",
    });
    const p3Svg = buildDxdSvg(settings, {
      ...options,
      animationMode: "reveal",
    });

    expect(p4Svg).not.toContain('id="dxd-curvature-compass"');
    expect(p3Svg).not.toContain('id="dxd-compass"');
    expect(p4Svg).toContain("dxd-reveal-shape");
  });
});
