"use client";

import {
  Check,
  Clipboard,
  Download,
  Grid3X3,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  buildDxdSvg,
  createAstroidArcLengthLookup,
  createAstroidPath,
  DXD_CENTER,
  DXD_CLASSICAL_SHARPNESS,
  DXD_GOLDEN_SHARPNESS,
  DXD_GOLDEN_WAIST_RATIO,
  DXD_LAW_TOLERANCE,
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
  type DxdAnimationMode,
  type DxdExportOptions,
  type DxdMarkSettings,
  type DxdTreatment,
} from "@/lib/dxd-mark";
import { cn } from "@/lib/utils";

const DEFAULT_SETTINGS: DxdMarkSettings = {
  sharpness: DXD_MASTER_SHARPNESS,
  radius: 300,
  rotation: DXD_MASTER_ROTATION,
  color: "#bdee63",
  treatment: "solid",
  strokeWidth: 12,
};

const DEFAULT_EXPORT_OPTIONS: DxdExportOptions = {
  includeGrid: true,
  includePolarGrid: true,
  includeRatioGrid: true,
  includeKinematicGrid: false,
  includePhiGrid: false,
  includeConstruction: false,
  includeCompass: true,
  includeControlPoints: true,
  includeMath: true,
  includeAnimation: true,
  animationMode: "draw",
  duration: 2.8,
  background: null,
};

const PRESETS = [
  { id: "mechanical", label: "Mechanical", value: DXD_CLASSICAL_SHARPNESS, ratio: "1:√2" },
  { id: "golden", label: "Golden waist", value: DXD_GOLDEN_SHARPNESS, ratio: "1:φ" },
  { id: "master", label: "DXD 1:2", value: DXD_MASTER_SHARPNESS, ratio: "1:2" },
] as const;

const COLOR_PRESETS = ["#bdee63", "#edeef0", "#111113", "#0090ff"];

function sliderValue(value: number | readonly number[]) {
  return Array.isArray(value) ? value[0] : value;
}

function svgCoordinate(value: number) {
  return Number(value.toFixed(3));
}

function getCurvatureCompassVisibility(parameter: number) {
  const quarterPosition = parameter * 4;
  const cuspDistance = Math.abs(quarterPosition - Math.round(quarterPosition)) / 4;
  const linear = Math.min(1, cuspDistance / (1 / 64));
  return linear * linear * (3 - 2 * linear);
}

function Parameter({
  label,
  value,
  suffix,
  min,
  max,
  step,
  precision,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step: number;
  precision?: number;
  onChange: (value: number) => void;
}) {
  const resolvedPrecision = precision ?? (Number.isInteger(step) ? 0 : step < 0.1 ? 2 : 1);

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <label className="text-[11px] font-medium text-[#a6adb8]">{label}</label>
        <output className="font-mono text-[11px] text-[var(--slate-12)]">
          {value.toFixed(resolvedPrecision)}
          {suffix}
        </output>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(sliderValue(next))}
        aria-label={label}
        className="[&_[data-slot=slider-range]]:bg-[var(--lime-9)] [&_[data-slot=slider-track]]:bg-[var(--slate-6)]"
      />
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-[#666e7b]">
        <span>{min.toFixed(resolvedPrecision)}</span>
        <span>{max.toFixed(resolvedPrecision)}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onCheckedChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-[#e2e5e9]">{label}</div>
        {detail ? <div className="mt-0.5 text-[10px] leading-4 text-[#737c89]">{detail}</div> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="data-checked:bg-[var(--lime-9)]"
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg border border-[#2d3138] bg-[#14171b] p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime-8)]",
            value === option.value
              ? "bg-[var(--slate-12)] text-[var(--slate-1)]"
              : "text-[var(--slate-10)] hover:bg-[var(--slate-4)] hover:text-[var(--slate-12)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function InspectorSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#2b2f35] px-5 py-5 last:border-b-0">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--lime-11)]">{eyebrow}</div>
          <h2 className="mt-1 text-[13px] font-semibold tracking-[-0.01em] text-[#f1f2f4]">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function PreviewGrid({ opacity }: { opacity: number }) {
  const positions = Array.from({ length: 17 }, (_, index) => 100 + index * 50);

  return (
    <g id="preview-grid" opacity={opacity} aria-label="Modular grid">
      {positions.flatMap((position) => {
        const major = position % 100 === 0;
        const className = major ? "stroke-[#8d98a7]" : "stroke-[#6b7480]";
        const lineOpacity = major ? 0.38 : 0.2;
        return [
          <line key={`x-${position}`} x1={position} y1="100" x2={position} y2="900" className={className} opacity={lineOpacity} strokeWidth={major ? 1.1 : 0.7} vectorEffect="non-scaling-stroke" />,
          <line key={`y-${position}`} x1="100" y1={position} x2="900" y2={position} className={className} opacity={lineOpacity} strokeWidth={major ? 1.1 : 0.7} vectorEffect="non-scaling-stroke" />,
        ];
      })}
    </g>
  );
}

function PreviewPolarGrid({ radius, opacity }: { radius: number; opacity: number }) {
  return (
    <g id="preview-polar-grid" opacity={opacity} aria-label="Polar grid with sixteen angular divisions">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <circle
          key={scale}
          cx={DXD_CENTER}
          cy={DXD_CENTER}
          r={radius * scale}
          fill="none"
          stroke={scale === 1 ? "var(--lime-9)" : "var(--slate-9)"}
          strokeWidth={scale === 1 ? 1 : 0.75}
          opacity={scale === 1 ? 0.42 : 0.22}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        return (
          <line
            key={index}
            x1={DXD_CENTER}
            y1={DXD_CENTER}
            x2={svgCoordinate(DXD_CENTER + radius * Math.cos(angle))}
            y2={svgCoordinate(DXD_CENTER + radius * Math.sin(angle))}
            stroke={index % 4 === 0 ? "var(--lime-9)" : "var(--slate-9)"}
            strokeWidth={index % 4 === 0 ? 1 : 0.75}
            opacity={index % 4 === 0 ? 0.34 : 0.16}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

function PreviewRatioGrid({
  settings,
  opacity,
}: {
  settings: DxdMarkSettings;
  opacity: number;
}) {
  const bound = settings.radius / Math.sqrt(2);
  const waistRatio = getWaistRatio(settings.sharpness);
  const waist = bound * waistRatio;
  const start = DXD_CENTER - bound;
  const size = bound * 2;
  const ratioLabel = Math.abs(waistRatio - 0.5) < DXD_LAW_TOLERANCE
    ? "W/B = 0.500 / EXACT 1:2"
    : Math.abs(waistRatio - DXD_GOLDEN_WAIST_RATIO) < DXD_LAW_TOLERANCE
      ? "W/B = 0.618 / 1:φ"
      : `W/B = ${waistRatio.toFixed(3)}`;
  const lineProps = {
    fill: "none",
    stroke: "var(--lime-9)",
    vectorEffect: "non-scaling-stroke" as const,
  };
  const waistPath = [
    `M ${DXD_CENTER} ${svgCoordinate(DXD_CENTER - waist)}`,
    `L ${svgCoordinate(DXD_CENTER + waist)} ${DXD_CENTER}`,
    `L ${DXD_CENTER} ${svgCoordinate(DXD_CENTER + waist)}`,
    `L ${svgCoordinate(DXD_CENTER - waist)} ${DXD_CENTER} Z`,
  ].join(" ");

  return (
    <g
      id="preview-ratio-grid"
      opacity={opacity}
      transform={`rotate(${svgCoordinate(settings.rotation - DXD_MASTER_ROTATION)} ${DXD_CENTER} ${DXD_CENTER})`}
      aria-label="Measured waist-ratio construction field"
    >
      <rect x={svgCoordinate(start)} y={svgCoordinate(start)} width={svgCoordinate(size)} height={svgCoordinate(size)} strokeWidth="1.1" opacity="0.58" {...lineProps} />
      <line x1={svgCoordinate(start)} y1={svgCoordinate(start)} x2={svgCoordinate(start + size)} y2={svgCoordinate(start + size)} strokeWidth="0.75" strokeDasharray="4 7" opacity="0.28" {...lineProps} />
      <line x1={svgCoordinate(start + size)} y1={svgCoordinate(start)} x2={svgCoordinate(start)} y2={svgCoordinate(start + size)} strokeWidth="0.75" strokeDasharray="4 7" opacity="0.28" {...lineProps} />
      <path d={waistPath} strokeWidth="1.25" strokeDasharray="6 5" opacity="0.72" {...lineProps} />
      <circle cx={DXD_CENTER} cy={DXD_CENTER} r={svgCoordinate(waist)} strokeWidth="0.75" opacity="0.34" {...lineProps} />
      <line x1={DXD_CENTER} y1={svgCoordinate(DXD_CENTER - waist)} x2={svgCoordinate(DXD_CENTER + bound)} y2={svgCoordinate(DXD_CENTER - waist)} strokeWidth="1" opacity="0.7" {...lineProps} />
      <text x={svgCoordinate(start)} y={svgCoordinate(start - 16)} fill="var(--lime-11)" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.1">
        {ratioLabel}
      </text>
    </g>
  );
}

function PreviewKinematicGrid({ radius, rotation, opacity }: { radius: number; rotation: number; opacity: number }) {
  const rollingRadius = radius / 4;
  const orbitRadius = radius - rollingRadius;
  const rotationRadians = (rotation * Math.PI) / 180;

  return (
    <g id="preview-kinematic-grid" opacity={opacity} aria-label="Twelve-station four-to-one motion field">
      <circle cx={DXD_CENTER} cy={DXD_CENTER} r={orbitRadius} fill="none" stroke="var(--lime-9)" strokeWidth="1.25" strokeDasharray="5 7" opacity="0.56" vectorEffect="non-scaling-stroke" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2 + rotationRadians;
        const x = DXD_CENTER + orbitRadius * Math.cos(angle);
        const y = DXD_CENTER + orbitRadius * Math.sin(angle);
        const displayX = svgCoordinate(x);
        const displayY = svgCoordinate(y);
        return (
          <g key={index} opacity={index % 3 === 0 ? 0.44 : 0.2}>
            <line x1={DXD_CENTER} y1={DXD_CENTER} x2={displayX} y2={displayY} stroke="var(--lime-11)" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
            <circle cx={displayX} cy={displayY} r={rollingRadius} fill="none" stroke="var(--lime-11)" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
            <circle cx={displayX} cy={displayY} r="3" fill="var(--lime-9)" />
          </g>
        );
      })}
      <text x={svgCoordinate(DXD_CENTER + orbitRadius * 0.72)} y={svgCoordinate(DXD_CENTER - orbitRadius * 0.72 - 12)} fill="var(--lime-11)" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.1">
        CENTER LOCUS / 3R/4
      </text>
    </g>
  );
}

function PreviewPhiGrid({ radius, opacity }: { radius: number; opacity: number }) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const start = DXD_CENTER - radius;
  const size = radius * 2;
  const near = start + size * (1 - 1 / phi);
  const far = start + size / phi;
  const lineProps = {
    stroke: "var(--amber-9)",
    strokeWidth: 1,
    strokeDasharray: "3 6",
    opacity: 0.58,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <g id="preview-phi-grid" opacity={opacity} aria-label="Golden ratio comparison field">
      <rect x={svgCoordinate(start)} y={svgCoordinate(start)} width={svgCoordinate(size)} height={svgCoordinate(size)} fill="none" {...lineProps} />
      <line x1={svgCoordinate(near)} y1={svgCoordinate(start)} x2={svgCoordinate(near)} y2={svgCoordinate(start + size)} {...lineProps} />
      <line x1={svgCoordinate(far)} y1={svgCoordinate(start)} x2={svgCoordinate(far)} y2={svgCoordinate(start + size)} {...lineProps} />
      <line x1={svgCoordinate(start)} y1={svgCoordinate(near)} x2={svgCoordinate(start + size)} y2={svgCoordinate(near)} {...lineProps} />
      <line x1={svgCoordinate(start)} y1={svgCoordinate(far)} x2={svgCoordinate(start + size)} y2={svgCoordinate(far)} {...lineProps} />
      <circle cx={DXD_CENTER} cy={DXD_CENTER} r={svgCoordinate(radius / phi)} fill="none" {...lineProps} />
      <circle cx={DXD_CENTER} cy={DXD_CENTER} r={svgCoordinate(radius / phi ** 2)} fill="none" {...lineProps} />
      <text x={svgCoordinate(start)} y={svgCoordinate(start - 16)} fill="var(--amber-11)" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="1.1">
        φ = 1.618 / COMPARISON, NOT SOURCE GEOMETRY
      </text>
    </g>
  );
}

function PreviewMath({
  settings,
  progress,
  showNotation,
  showSamples,
}: {
  settings: DxdMarkSettings;
  progress: number;
  showNotation: boolean;
  showSamples: boolean;
}) {
  const points = useMemo(() => generateAstroidPoints(settings, 64), [settings]);
  const livePoint = useMemo(() => getAstroidPoint(settings, progress), [progress, settings]);
  const liveFrame = useMemo(() => getAstroidFrame(settings, progress), [progress, settings]);
  const rotationRadians = (settings.rotation * Math.PI) / 180;
  const normalizedX = (livePoint.x - DXD_CENTER) / settings.radius;
  const normalizedY = (livePoint.y - DXD_CENTER) / settings.radius;
  const normalizedU = normalizedX * Math.cos(rotationRadians) + normalizedY * Math.sin(rotationRadians);
  const normalizedV = -normalizedX * Math.sin(rotationRadians) + normalizedY * Math.cos(rotationRadians);
  const angleDegrees = progress * 360;
  const tickValues = [-1, -0.5, 0, 0.5, 1];
  const dimensionY = DXD_CENTER + settings.radius + 48;
  const rollingRadius = settings.radius / 4;
  const isMechanical = Math.abs(settings.sharpness - DXD_CLASSICAL_SHARPNESS) < DXD_LAW_TOLERANCE;
  const waistRatio = getWaistRatio(settings.sharpness);

  if (!showNotation && !showSamples) return null;

  return (
    <g id="preview-math" aria-label="Live parametric notation">
      {showNotation ? (
        <>
      <g fill="var(--slate-11)" fontFamily="var(--font-mono)" fontSize="12" letterSpacing="0.35">
        <text x="126" y="124" fill="var(--lime-11)" fontSize="9" fontWeight="700" letterSpacing="1.6">
          DXD / PARAMETRIC FIELD
        </text>
        <text x="126" y="151">u(θ) = R·sgn(cosθ)·|cosθ|^p</text>
        <text x="126" y="176">v(θ) = R·sgn(sinθ)·|sinθ|^p</text>
        <text x="126" y="201" fill="var(--slate-9)" fontSize="10">
          p = {settings.sharpness.toFixed(3)} / α = {settings.rotation.toFixed(0)}° / W:B = {waistRatio.toFixed(3)}
        </text>
        {Math.abs(settings.sharpness - DXD_MASTER_SHARPNESS) < DXD_LAW_TOLERANCE ? (
          <text x="126" y="226" fill="var(--slate-9)" fontSize="10">
            √(|u|/R) + √(|v|/R) = 1
          </text>
        ) : null}
      </g>

      <g textAnchor="end" fill="var(--slate-11)" fontFamily="var(--font-mono)" fontSize="12" letterSpacing="0.35">
        <text x="874" y="124" fill="var(--lime-11)" fontSize="9" fontWeight="700" letterSpacing="1.6">
          LIVE COORDINATE / θ {angleDegrees.toFixed(1)}°
        </text>
        <text x="874" y="151">u / R = {normalizedU.toFixed(3)}</text>
        <text x="874" y="176">v / R = {normalizedV.toFixed(3)}</text>
        <text x="874" y="201" fill="var(--slate-9)" fontSize="10">
          {isMechanical
            ? "R:r = 4:1 / FIXED COMPASS"
            : `ρ/R = ${(liveFrame.curvatureRadius / settings.radius).toFixed(3)} / CURVATURE COMPASS`} / 64 SAMPLES
        </text>
      </g>

      <g
        id="preview-normalized-axes"
        transform={`rotate(${settings.rotation} ${DXD_CENTER} ${DXD_CENTER})`}
        aria-label="Rotated local coordinate ticks u and v"
        fill="var(--slate-9)"
        fontFamily="var(--font-mono)"
        fontSize="9"
      >
        {tickValues.map((value) => {
          const x = DXD_CENTER + value * settings.radius;
          return (
            <g key={`x-tick-${value}`}>
              <line x1={x} y1={DXD_CENTER - 7} x2={x} y2={DXD_CENTER + 7} stroke="var(--slate-9)" strokeWidth="1" opacity="0.72" vectorEffect="non-scaling-stroke" />
              <text x={x} y={DXD_CENTER + 26} textAnchor="middle">{value.toFixed(value === 0 ? 0 : 1)}</text>
            </g>
          );
        })}
        {tickValues.filter((value) => value !== 0).map((value) => {
          const y = DXD_CENTER + value * settings.radius;
          return (
            <g key={`y-tick-${value}`}>
              <line x1={DXD_CENTER - 7} y1={y} x2={DXD_CENTER + 7} y2={y} stroke="var(--slate-9)" strokeWidth="1" opacity="0.72" vectorEffect="non-scaling-stroke" />
              <text x={DXD_CENTER - 16} y={y + 4} textAnchor="end">{(-value).toFixed(1)}</text>
            </g>
          );
        })}
      </g>

      <g id="preview-radius-measure" fontFamily="var(--font-mono)" fontSize="9">
        <line x1={DXD_CENTER} y1={dimensionY} x2={DXD_CENTER + settings.radius} y2={dimensionY} stroke="var(--lime-9)" strokeWidth="1" opacity="0.78" vectorEffect="non-scaling-stroke" />
        <line x1={DXD_CENTER} y1={dimensionY - 9} x2={DXD_CENTER} y2={dimensionY + 9} stroke="var(--lime-9)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={DXD_CENTER + settings.radius} y1={dimensionY - 9} x2={DXD_CENTER + settings.radius} y2={dimensionY + 9} stroke="var(--lime-9)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <text x={DXD_CENTER + settings.radius / 2} y={dimensionY - 12} textAnchor="middle" fill="var(--lime-11)">
          R = {settings.radius.toFixed(0)}
        </text>
        {isMechanical ? (
          <g transform={`rotate(${settings.rotation} ${DXD_CENTER} ${DXD_CENTER})`}>
            <line x1={DXD_CENTER + settings.radius - rollingRadius} y1={DXD_CENTER} x2={DXD_CENTER + settings.radius} y2={DXD_CENTER} stroke="var(--amber-9)" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke" />
            <text x={DXD_CENTER + settings.radius - rollingRadius / 2} y={DXD_CENTER - 12} textAnchor="middle" fill="var(--amber-11)">
              r = {rollingRadius.toFixed(2)}
            </text>
          </g>
        ) : null}
      </g>
        </>
      ) : null}

      {showSamples ? (
        <g id="preview-parametric-samples" aria-label="64 parametric curve samples">
          {points.map((point, index) => {
            const revealed = index / points.length <= progress;
            const major = index % 8 === 0;
            return (
              <circle
                key={`sample-${index}`}
                cx={svgCoordinate(point.x)}
                cy={svgCoordinate(point.y)}
                r={major ? 4.5 : 2.25}
                fill={major ? "var(--lime-11)" : "var(--slate-11)"}
                opacity={revealed ? (major ? 0.96 : 0.68) : 0.12}
              />
            );
          })}
          <circle cx={svgCoordinate(livePoint.x)} cy={svgCoordinate(livePoint.y)} r="10" fill="none" stroke="var(--lime-11)" strokeWidth="1.5" opacity="0.9" vectorEffect="non-scaling-stroke" />
        </g>
      ) : null}
    </g>
  );
}

export function DxdMarkStudio() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showGrid, setShowGrid] = useState(true);
  const [showPolarGrid, setShowPolarGrid] = useState(true);
  const [showRatioGrid, setShowRatioGrid] = useState(true);
  const [showKinematicGrid, setShowKinematicGrid] = useState(false);
  const [showPhiGrid, setShowPhiGrid] = useState(false);
  const [showConstruction, setShowConstruction] = useState(false);
  const [showCompass, setShowCompass] = useState(true);
  const [showControlPoints, setShowControlPoints] = useState(true);
  const [showMath, setShowMath] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [animationMode, setAnimationMode] = useState<DxdAnimationMode>("draw");
  const [duration, setDuration] = useState(2.8);
  const [loop, setLoop] = useState(false);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [exportOptions, setExportOptions] = useState(DEFAULT_EXPORT_OPTIONS);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const progressRef = useRef(progress);

  const updateProgress = useCallback((next: number) => {
    const bounded = Math.min(1, Math.max(0, next));
    progressRef.current = bounded;
    setProgress(bounded);
  }, []);

  useEffect(() => {
    if (!playing) return;

    let previousTime = Date.now();

    const advance = () => {
      const now = Date.now();
      const elapsed = (now - previousTime) / (duration * 1000);
      previousTime = now;
      const next = progressRef.current + elapsed;

      if (next >= 1) {
        if (loop) {
          updateProgress(0);
          return;
        }

        updateProgress(1);
        setPlaying(false);
        return;
      }

      updateProgress(next);
    };

    const interval = window.setInterval(advance, 16);

    return () => window.clearInterval(interval);
  }, [duration, loop, playing, updateProgress]);

  const path = useMemo(
    () => createAstroidPath(settings),
    [settings],
  );
  const tracePath = useMemo(
    () => createAstroidPath(settings, 64, false),
    [settings],
  );
  const construction = useMemo(
    () => getConstructionGeometry(settings.radius, settings.rotation),
    [settings.radius, settings.rotation],
  );
  const isBrandProfile = Math.abs(settings.sharpness - DXD_MASTER_SHARPNESS) < DXD_LAW_TOLERANCE;
  const isBrandMaster = isDxdMaster(settings);
  const isMechanical = Math.abs(settings.sharpness - DXD_CLASSICAL_SHARPNESS) < DXD_LAW_TOLERANCE;
  const isGolden = Math.abs(settings.sharpness - DXD_GOLDEN_SHARPNESS) < DXD_LAW_TOLERANCE;
  const waistRatio = getWaistRatio(settings.sharpness);
  const tracerMatchesPreview = animationMode === "draw";
  const tracerWillExport = !exportOptions.includeAnimation || animationMode === "draw";
  const guideProgress = Math.min(1, progress / 0.18);
  const markProgress = Math.min(1, Math.max(0, (progress - 0.12) / 0.88));
  const fillProgress = Math.min(1, Math.max(0, (markProgress - 0.72) / 0.28));
  const arcLengthLookup = useMemo(() => createAstroidArcLengthLookup(settings), [settings]);
  const parameterProgress = useMemo(
    () => getParameterAtArcProgress(arcLengthLookup, markProgress),
    [arcLengthLookup, markProgress],
  );
  const compass = useMemo(
    () => getCompassState(settings.radius, parameterProgress, settings.rotation),
    [parameterProgress, settings.radius, settings.rotation],
  );
  const curvatureFrame = useMemo(
    () => getAstroidFrame(settings, parameterProgress),
    [parameterProgress, settings],
  );
  const curvatureInstrumentOpacity = playing
    ? getCurvatureCompassVisibility(parameterProgress)
    : 1;

  const updateSetting = <K extends keyof DxdMarkSettings>(key: K, value: DxdMarkSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const replay = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      updateProgress(1);
      setPlaying(false);
      return;
    }
    updateProgress(0);
    setPlaying(true);
  };

  const getExportPayload = useCallback(() => {
    return buildDxdSvg(settings, {
      ...exportOptions,
      animationMode,
      duration,
    });
  }, [animationMode, duration, exportOptions, settings]);

  const downloadSvg = () => {
    const blob = new Blob([getExportPayload()], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const variant = isBrandMaster
      ? "master"
      : isMechanical
        ? "classical"
        : `p${settings.sharpness.toFixed(2)}`;
    link.download = `dxd-mark-${variant}${exportOptions.includeAnimation ? "-animated" : ""}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copySvg = async () => {
    await navigator.clipboard.writeText(getExportPayload());
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    setShowGrid(true);
    setShowPolarGrid(true);
    setShowRatioGrid(true);
    setShowKinematicGrid(false);
    setShowPhiGrid(false);
    setShowConstruction(false);
    setShowCompass(true);
    setShowControlPoints(true);
    setShowMath(true);
    setShowSamples(true);
    setAnimationMode("draw");
    setDuration(2.8);
    setLoop(false);
    setExportOptions(DEFAULT_EXPORT_OPTIONS);
    replay();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--slate-1)] text-[var(--slate-12)] selection:bg-[var(--lime-9)] selection:text-[var(--lime-1)] lg:h-dvh lg:overflow-hidden">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--slate-6)] bg-[var(--slate-1)]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md border border-[#3a3e45] bg-[#171a1f]">
            <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
              <path d="M16 3 C16 11 21 16 29 16 C21 16 16 21 16 29 C16 21 11 16 3 16 C11 16 16 11 16 3Z" fill="var(--lime-9)" transform="rotate(45 16 16)" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tracking-[-0.02em]">DXD Mark Lab</span>
              <span className="rounded border border-[#3b414a] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#89929e]">V1.0</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.15em] text-[#717984]">Division identity / parametric master</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-[#2f353c] px-3 py-1.5 md:flex">
            <span className="size-1.5 rounded-full bg-[var(--lime-9)] shadow-[0_0_10px_rgba(189,238,99,.5)]" />
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#9ca4af]">Vector live</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={reset}
            aria-label="Reset generator"
            className="text-[#949ca7] hover:bg-[#24282e] hover:text-white"
          >
            <RotateCcw />
          </Button>
          <Button
            onClick={downloadSvg}
            className="h-9 gap-2 rounded-md bg-[var(--lime-9)] px-3 text-[11px] font-semibold text-[var(--lime-1)] hover:bg-[var(--lime-10)] focus-visible:ring-[var(--lime-8)]"
          >
            <Download />
            Download SVG
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative flex min-h-[560px] min-w-0 flex-col overflow-hidden border-b border-[#2b2f35] bg-[#171a1f] lg:min-h-0 lg:border-r lg:border-b-0" aria-label="Live DXD mark preview">
          <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-[#2b2f35] px-4 py-2 sm:px-5">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[#8b939e]">
              <Sparkles className="size-3.5 text-[var(--lime-11)]" />
              Live construction
            </div>
            <span className="hidden h-3 w-px bg-[#343940] sm:block" />
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.13em] text-[#646d78] sm:inline">
              1000 × 1000 / 64-segment cubic path / C4 symmetry
            </span>
            <div className="ml-auto flex items-center gap-1">
              {[
                { label: "XY", active: showGrid, toggle: () => setShowGrid((value) => !value) },
                { label: "Polar", active: showPolarGrid, toggle: () => setShowPolarGrid((value) => !value) },
                { label: "Ratio", active: showRatioGrid, toggle: () => setShowRatioGrid((value) => !value) },
                { label: "4:1", active: showKinematicGrid, toggle: () => setShowKinematicGrid((value) => !value) },
                { label: "Phi", active: showPhiGrid, toggle: () => setShowPhiGrid((value) => !value) },
                { label: "Circles", active: showConstruction, toggle: () => setShowConstruction((value) => !value) },
                { label: "Tracer", active: showCompass && tracerMatchesPreview, toggle: () => setShowCompass((value) => !value) },
                { label: "Points", active: showControlPoints, toggle: () => setShowControlPoints((value) => !value) },
                { label: "Math", active: showMath, toggle: () => setShowMath((value) => !value) },
              ].map((layer) => (
                <button
                  key={layer.label}
                  type="button"
                  onClick={layer.toggle}
                  aria-pressed={layer.active}
                  className={cn(
                    "rounded px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime-8)]",
                    layer.active ? "bg-[var(--lime-3)] text-[var(--lime-12)]" : "text-[#68717d] hover:bg-[#22262c] hover:text-[#aeb5bf]",
                  )}
                >
                  {layer.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-5 sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="pointer-events-none absolute left-5 top-5 font-mono text-[8px] uppercase leading-5 tracking-[0.16em] text-[#555e69] sm:left-7 sm:top-7">
              <div>Origin / 500,500</div>
              <div>Unit / 50</div>
            </div>
            <div className="pointer-events-none absolute right-5 top-5 text-right font-mono text-[8px] uppercase leading-5 tracking-[0.16em] text-[#555e69] sm:right-7 sm:top-7">
              <div>{isBrandMaster ? "DXD canonical / 1:2" : isMechanical ? "Mechanical / 4:1" : isGolden ? "Golden waist / 1:φ" : isBrandProfile ? "P4 rotated variant" : "Derived waist geometry"}</div>
              <div>P / {settings.sharpness.toFixed(3)} · W/B / {waistRatio.toFixed(3)}</div>
            </div>

            <div className="relative aspect-square max-h-[min(70vh,760px)] w-full max-w-[760px]">
              <div className="absolute inset-[7%] rounded-[2px] border border-[#31363e] bg-[#12151a] shadow-[0_28px_80px_rgba(0,0,0,.28)]" />
              <svg
                viewBox="0 0 1000 1000"
                role="img"
                aria-labelledby="preview-title preview-description"
                className="relative size-full overflow-visible"
                shapeRendering="geometricPrecision"
              >
                <title id="preview-title">DXD four-cusp mark preview</title>
                <desc id="preview-description">Parametric DXD mark displayed with a measured waist-ratio grid, live mathematical notation, sampled coordinates, and a path-matched construction instrument.</desc>
                <defs>
                  <clipPath id="preview-reveal">
                    <rect x="0" y="0" width={1000 * markProgress} height="1000" />
                  </clipPath>
                  <clipPath id="preview-instrument-clip">
                    <rect x="70" y="70" width="860" height="860" />
                  </clipPath>
                  <filter id="point-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {showGrid ? <PreviewGrid opacity={guideProgress} /> : null}
                {showPolarGrid ? <PreviewPolarGrid radius={settings.radius} opacity={guideProgress} /> : null}
                {showRatioGrid ? <PreviewRatioGrid settings={settings} opacity={guideProgress} /> : null}
                {showKinematicGrid ? <PreviewKinematicGrid radius={settings.radius} rotation={settings.rotation} opacity={guideProgress} /> : null}
                {showPhiGrid ? <PreviewPhiGrid radius={settings.radius} opacity={guideProgress} /> : null}

                {showConstruction ? (
                  <g id="preview-construction" opacity={guideProgress}>
                    <circle
                      cx={DXD_CENTER}
                      cy={DXD_CENTER}
                      r={svgCoordinate(construction.fixedCircleRadius)}
                      fill="none"
                      stroke="var(--blue-9)"
                      strokeWidth="1.5"
                      opacity="0.72"
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect
                      x={svgCoordinate(construction.boundingBox.x)}
                      y={svgCoordinate(construction.boundingBox.y)}
                      width={svgCoordinate(construction.boundingBox.size)}
                      height={svgCoordinate(construction.boundingBox.size)}
                      fill="none"
                      stroke="var(--slate-10)"
                      strokeWidth="1"
                      opacity="0.58"
                      vectorEffect="non-scaling-stroke"
                    />
                    <g transform={`rotate(${settings.rotation} ${DXD_CENTER} ${DXD_CENTER})`} aria-label="Local construction axes u and v">
                      <line x1="100" y1={DXD_CENTER} x2="900" y2={DXD_CENTER} stroke="var(--slate-10)" strokeWidth="1" opacity="0.55" vectorEffect="non-scaling-stroke" />
                      <line x1={DXD_CENTER} y1="100" x2={DXD_CENTER} y2="900" stroke="var(--slate-10)" strokeWidth="1" opacity="0.55" vectorEffect="non-scaling-stroke" />
                    </g>
                    {construction.rollingCircleCenters.map((point, index) => (
                      <circle
                        key={`${point.x}-${point.y}`}
                        cx={svgCoordinate(point.x)}
                        cy={svgCoordinate(point.y)}
                        r={svgCoordinate(construction.rollingCircleRadius)}
                        fill="none"
                        stroke="var(--amber-9)"
                        strokeWidth="1.25"
                        strokeDasharray="8 8"
                        strokeDashoffset={-index * 4}
                        opacity={isMechanical ? 0.82 : 0.3}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {!isMechanical ? (
                      <text x="500" y="927" textAnchor="middle" fill="var(--amber-11)" fontSize="15" fontFamily="var(--font-mono)" letterSpacing="1.6">
                        CLASSICAL CIRCLES ARE EXACT AT P = 3.00
                      </text>
                    ) : null}
                  </g>
                ) : null}

                {animationMode === "reveal" ? (
                  <path
                    d={path}
                    clipPath="url(#preview-reveal)"
                    fill={settings.treatment === "solid" ? settings.color : "none"}
                    stroke={settings.treatment === "outline" ? settings.color : "none"}
                    strokeWidth={settings.strokeWidth}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <g>
                    {settings.treatment === "solid" ? (
                      <path d={path} fill={settings.color} opacity={fillProgress} />
                    ) : null}
                    <path
                      d={tracePath}
                      pathLength="1"
                      fill="none"
                      stroke={settings.color}
                      strokeWidth={settings.treatment === "outline" ? settings.strokeWidth : Math.max(4, settings.strokeWidth / 2)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="1"
                      strokeDashoffset={1 - markProgress}
                    />
                  </g>
                )}

                <PreviewMath settings={settings} progress={parameterProgress} showNotation={showMath} showSamples={showSamples} />

                {showCompass && tracerMatchesPreview && isMechanical ? (
                  <g
                    id="preview-compass"
                    aria-label="Rolling-circle compass tracer"
                  >
                    <circle
                      cx={svgCoordinate(compass.center.x)}
                      cy={svgCoordinate(compass.center.y)}
                      r={svgCoordinate(compass.rollingCircleRadius)}
                      fill="var(--amber-1)"
                      fillOpacity="0.78"
                      stroke="var(--amber-9)"
                      strokeWidth="2.25"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line x1={svgCoordinate(compass.oppositeRim.x)} y1={svgCoordinate(compass.oppositeRim.y)} x2={svgCoordinate(compass.tracer.x)} y2={svgCoordinate(compass.tracer.y)} stroke="var(--amber-8)" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke" />
                    <line x1={svgCoordinate(compass.crossStart.x)} y1={svgCoordinate(compass.crossStart.y)} x2={svgCoordinate(compass.crossEnd.x)} y2={svgCoordinate(compass.crossEnd.y)} stroke="var(--amber-8)" strokeWidth="1" opacity="0.72" vectorEffect="non-scaling-stroke" />
                    <line x1={svgCoordinate(compass.center.x)} y1={svgCoordinate(compass.center.y)} x2={svgCoordinate(compass.tracer.x)} y2={svgCoordinate(compass.tracer.y)} stroke="var(--amber-11)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
                    <circle cx={svgCoordinate(compass.center.x)} cy={svgCoordinate(compass.center.y)} r="6" fill="var(--amber-9)" stroke="var(--slate-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <circle cx={svgCoordinate(compass.tracer.x)} cy={svgCoordinate(compass.tracer.y)} r="16" fill={settings.color} opacity="0.14" />
                    <circle cx={svgCoordinate(compass.tracer.x)} cy={svgCoordinate(compass.tracer.y)} r="8" fill={settings.color} stroke="var(--slate-12)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  </g>
                ) : null}

                {showCompass && tracerMatchesPreview && !isMechanical ? (
                  <g
                    id="preview-curvature-compass"
                    aria-label="Path-true variable-radius osculating compass"
                  >
                    <g clipPath="url(#preview-instrument-clip)" opacity={curvatureInstrumentOpacity}>
                    {curvatureFrame.alternateCurvatureCenter ? (
                      <>
                        <circle
                          cx={svgCoordinate(curvatureFrame.alternateCurvatureCenter.x)}
                          cy={svgCoordinate(curvatureFrame.alternateCurvatureCenter.y)}
                          r={svgCoordinate(curvatureFrame.curvatureRadius)}
                          fill="none"
                          stroke="var(--lime-9)"
                          strokeWidth="1.25"
                          strokeDasharray="4 9"
                          opacity="0.2"
                          vectorEffect="non-scaling-stroke"
                        />
                        <line
                          x1={svgCoordinate(curvatureFrame.alternateCurvatureCenter.x)}
                          y1={svgCoordinate(curvatureFrame.alternateCurvatureCenter.y)}
                          x2={svgCoordinate(curvatureFrame.point.x)}
                          y2={svgCoordinate(curvatureFrame.point.y)}
                          stroke="var(--lime-9)"
                          strokeWidth="1"
                          opacity="0.2"
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    ) : null}
                    <circle
                      id="preview-osculating-circle"
                      cx={svgCoordinate(curvatureFrame.curvatureCenter.x)}
                      cy={svgCoordinate(curvatureFrame.curvatureCenter.y)}
                      r={svgCoordinate(curvatureFrame.curvatureRadius)}
                      fill="none"
                      stroke="var(--lime-9)"
                      strokeWidth="1.5"
                      strokeDasharray="8 7"
                      opacity="0.42"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={svgCoordinate(curvatureFrame.curvatureCenter.x)}
                      y1={svgCoordinate(curvatureFrame.curvatureCenter.y)}
                      x2={svgCoordinate(curvatureFrame.point.x)}
                      y2={svgCoordinate(curvatureFrame.point.y)}
                      stroke="var(--lime-11)"
                      strokeWidth="1.75"
                      opacity="0.86"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle cx={svgCoordinate(curvatureFrame.curvatureCenter.x)} cy={svgCoordinate(curvatureFrame.curvatureCenter.y)} r="6" fill="var(--lime-9)" stroke="var(--slate-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    <text
                      x={svgCoordinate((curvatureFrame.curvatureCenter.x + curvatureFrame.point.x) / 2)}
                      y={svgCoordinate((curvatureFrame.curvatureCenter.y + curvatureFrame.point.y) / 2 - 10)}
                      fill="var(--lime-11)"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      ρ {curvatureFrame.curvatureRadius.toFixed(1)}
                    </text>
                    {curvatureFrame.alternateCurvatureCenter ? (
                      <text x={svgCoordinate(curvatureFrame.point.x)} y={svgCoordinate(curvatureFrame.point.y + 30)} fill="var(--lime-11)" fontSize="8" fontFamily="var(--font-mono)" textAnchor="middle" letterSpacing="1">
                        CUSP / TWO ONE-SIDED CIRCLES
                      </text>
                    ) : null}
                    <g transform={formatCurveFrameTransform(curvatureFrame)}>
                      <line x1="-28" y1="0" x2="28" y2="0" stroke="var(--lime-11)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      <line x1="0" y1="-18" x2="0" y2="18" stroke="var(--slate-10)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                      <circle cx="0" cy="0" r="14" fill="var(--lime-1)" fillOpacity="0.86" stroke="var(--lime-11)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      <circle cx="0" cy="0" r="5" fill={settings.color} stroke="var(--slate-12)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    </g>
                    </g>
                  </g>
                ) : null}

                {showControlPoints ? (
                  <g opacity={guideProgress} filter="url(#point-glow)">
                    {construction.cuspPoints.map((point, index) => (
                      <circle key={`point-${index}`} cx={svgCoordinate(point.x)} cy={svgCoordinate(point.y)} r="7" fill="var(--slate-12)" stroke="var(--slate-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    ))}
                  </g>
                ) : null}
              </svg>
            </div>
          </div>

          <div className="flex min-h-14 flex-wrap items-center gap-3 border-t border-[#2b2f35] bg-[#14171b] px-4 py-2.5 sm:px-5">
            <Button
              variant="outline"
              size="icon"
              className="size-8 border-[#363b43] bg-[#1a1e23] text-[#e8eaed] hover:bg-[#282d34]"
              onClick={() => {
                if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                  updateProgress(1);
                  setPlaying(false);
                  return;
                }
                setPlaying((value) => !value);
              }}
              aria-label={playing ? "Pause animation" : "Play animation"}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-[#858e99] hover:bg-[#282d34] hover:text-white"
              onClick={replay}
              aria-label="Replay animation"
            >
              <RotateCcw />
            </Button>
            <Slider
              value={[progress * 100]}
              min={0}
              max={100}
              step={0.1}
              onValueChange={(next) => {
                setPlaying(false);
                updateProgress(sliderValue(next) / 100);
              }}
              aria-label="Animation progress"
              className="min-w-36 flex-1 [&_[data-slot=slider-range]]:bg-[var(--lime-9)] [&_[data-slot=slider-track]]:bg-[var(--slate-6)]"
            />
            <output className="w-10 text-right font-mono text-[9px] text-[#9098a3]">{Math.round(progress * 100)}%</output>
            <div className="hidden h-4 w-px bg-[#373c43] sm:block" />
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.13em] text-[#6f7884] sm:inline">
              {animationMode} / {duration.toFixed(1)}s
            </span>
          </div>
        </section>

        <aside className="min-h-0 bg-[#191c21] lg:overflow-y-auto" aria-label="DXD mark settings">
          <InspectorSection eyebrow="01 / Form" title="Master geometry">
            <div className="mb-5 grid grid-cols-3 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSettings((current) => ({
                      ...current,
                      sharpness: preset.value,
                      rotation: DXD_MASTER_ROTATION,
                    }));
                    setShowRatioGrid(true);
                  }}
                  aria-pressed={
                    Math.abs(settings.sharpness - preset.value) < DXD_LAW_TOLERANCE &&
                    Math.abs(settings.rotation - DXD_MASTER_ROTATION) < DXD_LAW_TOLERANCE
                  }
                  className={cn(
                    "rounded-md border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime-8)]",
                    Math.abs(settings.sharpness - preset.value) < DXD_LAW_TOLERANCE &&
                      Math.abs(settings.rotation - DXD_MASTER_ROTATION) < DXD_LAW_TOLERANCE
                      ? "border-[var(--lime-8)] bg-[var(--lime-3)] text-[var(--lime-12)]"
                      : "border-[#30343b] bg-[#15181c] text-[#777f8a] hover:border-[#464c55] hover:text-[#cfd3d8]",
                  )}
                >
                  <span className="block text-[10px] font-semibold">{preset.label}</span>
                  <span className="mt-1 block font-mono text-[9px] opacity-65">{preset.ratio} · P {preset.value.toFixed(3)}</span>
                </button>
              ))}
            </div>

            <div className={cn(
              "mb-5 border-l-2 px-3 py-2.5",
              isBrandMaster
                ? "border-[var(--lime-9)] bg-[var(--lime-2)]"
                : isMechanical
                  ? "border-[var(--blue-9)] bg-[var(--blue-2)]"
                  : "border-[var(--amber-9)] bg-[var(--amber-2)]",
            )}>
              <div className={cn(
                "font-mono text-[8px] font-semibold uppercase tracking-[0.15em]",
                isBrandMaster
                  ? "text-[var(--lime-11)]"
                  : isMechanical
                    ? "text-[var(--blue-11)]"
                    : "text-[var(--amber-11)]",
              )}>
                {isBrandMaster
                  ? "DXD canonical quartic / exact 1:2 waist"
                  : isMechanical
                    ? "Mechanical astroid / exact 4:1 roller"
                    : isGolden
                      ? "Golden-waist comparator / chosen proportion"
                    : isBrandProfile
                      ? "P4 profile / rotated variant"
                      : "Derived waist profile / curvature compass"}
              </div>
              <p className="mt-1.5 text-[9px] leading-4 text-[#89929e]">
                {isBrandMaster
                  ? "P 4.000 is generated from W/B = 1/2, not traced from the old artwork. Its true osculating compass changes from ρ = 2R at a one-sided tip to ρ = R/√2 at the waist."
                  : isMechanical
                    ? "P 3.000 is the exact four-cusp hypocycloid traced when a circle of radius r = R/4 rolls inside the fixed circle; its waist is W/B = 1/√2."
                    : isGolden
                      ? "P = 2 + 2·log₂φ gives W/B = 1/φ. It is a deliberate comparator—not a claim that the golden ratio is universally optimal."
                    : isBrandProfile
                      ? "The canonical 1:2 profile is preserved, but the DXD X uses α = 45°. Choose DXD 1:2 to restore its orientation."
                      : "The exponent is derived from the measured waist. A variable-radius osculating compass stays tangent to every non-cusp point."}
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <Parameter
                  label="Waist ratio (W/B)"
                  value={waistRatio}
                  min={0.5}
                  max={1 / Math.sqrt(2)}
                  step={0.001}
                  precision={3}
                  onChange={(value) => updateSetting("sharpness", getSharpnessFromWaistRatio(value))}
                />
                <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.11em] text-[#69727e]">
                  p = 2 − 2 log₂(W/B) = {settings.sharpness.toFixed(3)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--lime-7)] bg-[var(--lime-2)] p-3.5">
                <Parameter label="Master radius (R)" value={settings.radius} suffix=" px" min={180} max={330} step={1} onChange={(value) => updateSetting("radius", value)} />
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--lime-6)] pt-3">
                  <p className="max-w-40 text-[9px] leading-4 text-[var(--lime-11)]">
                    {isMechanical
                      ? "Resizes the mark and exact 4:1 compass mechanism together."
                      : "Resizes the mark and its true curvature compass together."}
                  </p>
                  <div className="flex gap-1" role="group" aria-label="Radius presets">
                    {[220, 300, 330].map((radius) => (
                      <button
                        key={radius}
                        type="button"
                        onClick={() => updateSetting("radius", radius)}
                        aria-pressed={settings.radius === radius}
                        className={cn(
                          "rounded border px-2 py-1 font-mono text-[8px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime-8)]",
                          settings.radius === radius
                            ? "border-[var(--lime-8)] bg-[var(--lime-5)] text-[var(--lime-12)]"
                            : "border-[var(--lime-6)] bg-[var(--lime-3)] text-[var(--lime-11)] hover:bg-[var(--lime-4)]",
                        )}
                      >
                        {radius}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Parameter label="Rotation" value={settings.rotation} suffix="°" min={0} max={45} step={1} onChange={(value) => updateSetting("rotation", value)} />
            </div>

            <div className="mt-5 space-y-3">
              <SegmentedControl<DxdTreatment>
                label="Mark treatment"
                value={settings.treatment}
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "outline", label: "Outline" },
                ]}
                onChange={(value) => updateSetting("treatment", value)}
              />
              {settings.treatment === "outline" ? (
                <Parameter label="Outline weight" value={settings.strokeWidth} suffix=" px" min={4} max={40} step={1} onChange={(value) => updateSetting("strokeWidth", value)} />
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-[#2d3239] bg-[#15181c] p-3">
              <div>
                <div className="text-[11px] font-medium text-[#dfe2e6]">Mark color</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.11em] text-[#6f7884]">{settings.color}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateSetting("color", color)}
                    aria-label={`Set mark color ${color}`}
                    aria-pressed={settings.color === color}
                    className={cn(
                      "size-5 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime-8)]",
                      settings.color === color ? "border-white ring-1 ring-white/40" : "border-white/15",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <label className="relative ml-0.5 grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-[var(--slate-8)] text-[10px] text-[var(--slate-11)] focus-within:ring-2 focus-within:ring-[var(--lime-8)]">
                  +
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(event) => updateSetting("color", event.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Choose a custom mark color"
                  />
                </label>
              </div>
            </div>
          </InspectorSection>

          <InspectorSection eyebrow="02 / Layers" title="Construction view">
            <div className="space-y-1">
              <ToggleRow label="Cartesian grid" detail="50-unit subdivisions with 100-unit majors" checked={showGrid} onCheckedChange={setShowGrid} />
              <ToggleRow label="Polar grid" detail="Four radii and sixteen angular divisions" checked={showPolarGrid} onCheckedChange={setShowPolarGrid} />
              <ToggleRow label="Measured waist field" detail={`Envelope, waist, and W/B = ${waistRatio.toFixed(3)}`} checked={showRatioGrid} onCheckedChange={setShowRatioGrid} />
              <ToggleRow label="4:1 comparison field" detail="P3 rolling-circle stations; a comparison layer for the P4 master" checked={showKinematicGrid} onCheckedChange={setShowKinematicGrid} />
              <ToggleRow label="φ comparison" detail="Optional 1.618 overlay; not the source geometry" checked={showPhiGrid} onCheckedChange={setShowPhiGrid} />
              <ToggleRow label="Classical circles" detail="4:1 hypocycloid construction, exact at P 3.00" checked={showConstruction} onCheckedChange={setShowConstruction} />
              <ToggleRow
                label={isMechanical ? "Rolling compass" : "Curvature compass"}
                detail={tracerMatchesPreview
                  ? isMechanical
                    ? "Arc-synchronized 4:1 rolling circle and drawing point"
                    : "Osculating circle, radius arm, tangent, and drawing point stay on the path"
                  : "Hidden during the horizontal wipe; use Path draw for synchronized tracing"}
                checked={showCompass}
                onCheckedChange={setShowCompass}
              />
              <ToggleRow label="Cusp control points" detail="Four rotated extent anchors" checked={showControlPoints} onCheckedChange={setShowControlPoints} />
            </div>
          </InspectorSection>

          <InspectorSection eyebrow="03 / Math" title="Parametric field">
            <div className="rounded-lg border border-[var(--lime-7)] bg-[var(--lime-2)] p-3.5 font-mono">
              <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--lime-11)]">Lamé coordinate model</div>
              <div className="mt-3 space-y-1 text-[10px] leading-4 text-[var(--slate-12)]">
                <div>u(θ) = R·sgn(cosθ)·|cosθ|<sup>p</sup></div>
                <div>v(θ) = R·sgn(sinθ)·|sinθ|<sup>p</sup></div>
                {isBrandProfile ? <div>√(|u|/R) + √(|v|/R) = 1</div> : null}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded border border-[var(--lime-6)] bg-[var(--lime-6)]">
                {(isMechanical
                  ? [
                      ["R", settings.radius.toFixed(0)],
                      ["r", (settings.radius / 4).toFixed(2)],
                      ["R:r", "4:1"],
                    ]
                  : [
                      ["R", settings.radius.toFixed(0)],
                      ["W/B", waistRatio.toFixed(3)],
                      ["ρ/R", (curvatureFrame.curvatureRadius / settings.radius).toFixed(3)],
                    ]).map(([label, value]) => (
                  <div key={label} className="bg-[var(--lime-2)] px-2 py-2">
                    <div className="text-[7px] uppercase tracking-[0.14em] text-[var(--lime-10)]">{label}</div>
                    <div className="mt-1 text-[10px] text-[var(--lime-12)]">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-1">
              <ToggleRow label="Mathematical notation" detail="Equations, normalized axes, and radius dimensions" checked={showMath} onCheckedChange={setShowMath} />
              <ToggleRow label="Parametric samples" detail="64 measured points reveal along the drawing path" checked={showSamples} onCheckedChange={setShowSamples} />
            </div>
          </InspectorSection>

          <InspectorSection eyebrow="04 / Motion" title="Drawing sequence">
            <SegmentedControl<DxdAnimationMode>
              label="Animation mode"
              value={animationMode}
              options={[
                { value: "draw", label: "Path draw" },
                { value: "reveal", label: "Wipe reveal" },
              ]}
              onChange={(value) => {
                setAnimationMode(value);
                replay();
              }}
            />
            <div className="mt-5 space-y-5">
              <Parameter label="Sequence duration" value={duration} suffix=" sec" min={0.8} max={6} step={0.1} onChange={setDuration} />
              <ToggleRow label="Loop preview" detail="Exported SVG plays once by default" checked={loop} onCheckedChange={setLoop} />
            </div>
            <Button
              variant="outline"
              className="mt-4 h-9 w-full gap-2 border-[#3a4048] bg-[#20242a] text-[11px] text-[#e7e9ec] hover:bg-[#2a3037]"
              onClick={replay}
            >
              <Play />
              Replay sequence
            </Button>
          </InspectorSection>

          <InspectorSection eyebrow="05 / Output" title="Production SVG">
            <div className="space-y-1">
              <ToggleRow
                label="Include Cartesian grid"
                checked={exportOptions.includeGrid}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeGrid: checked }))}
              />
              <ToggleRow
                label="Include polar grid"
                checked={exportOptions.includePolarGrid}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includePolarGrid: checked }))}
              />
              <ToggleRow
                label="Include measured waist field"
                checked={exportOptions.includeRatioGrid}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeRatioGrid: checked }))}
              />
              <ToggleRow
                label="Include 4:1 comparison field"
                checked={exportOptions.includeKinematicGrid}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeKinematicGrid: checked }))}
              />
              <ToggleRow
                label="Include φ comparison"
                checked={exportOptions.includePhiGrid}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includePhiGrid: checked }))}
              />
              <ToggleRow
                label="Include construction circles"
                checked={exportOptions.includeConstruction}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeConstruction: checked }))}
              />
              <ToggleRow
                label={isMechanical ? "Include rolling compass" : "Include curvature compass"}
                detail={tracerWillExport
                  ? isMechanical
                    ? "Arc-length matched to the classical P3 drawing"
                    : "Variable radius, pivot, tangent, and tracer are embedded in the SVG"
                  : "Omitted from animated wipe exports to avoid false synchronization"}
                checked={exportOptions.includeCompass}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeCompass: checked }))}
              />
              <ToggleRow
                label="Include control points"
                checked={exportOptions.includeControlPoints}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeControlPoints: checked }))}
              />
              <ToggleRow
                label="Include math notation"
                detail="Named equations, dimensions, axes, and sample points"
                checked={exportOptions.includeMath}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeMath: checked }))}
              />
              <ToggleRow
                label="Embed animation"
                detail="Self-contained CSS with reduced-motion fallback"
                checked={exportOptions.includeAnimation}
                onCheckedChange={(checked) => setExportOptions((current) => ({ ...current, includeAnimation: checked }))}
              />
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-[11px] font-medium text-[#a6adb8]">Canvas background</span>
              <select
                value={exportOptions.background ?? "transparent"}
                onChange={(event) =>
                  setExportOptions((current) => ({
                    ...current,
                    background: event.target.value === "transparent" ? null : event.target.value,
                  }))
                }
                className="h-9 w-full rounded-md border border-[var(--slate-6)] bg-[var(--slate-2)] px-3 text-[11px] text-[var(--slate-12)] outline-none focus:border-[var(--lime-8)] focus:ring-2 focus:ring-[var(--lime-8)]/20"
              >
                <option value="transparent">Transparent / production</option>
                <option value="#111113">Radix slate dark</option>
                <option value="#edeef0">Radix slate light</option>
              </select>
            </label>

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <Button onClick={downloadSvg} className="h-10 gap-2 rounded-md bg-[var(--lime-9)] text-[11px] font-semibold text-[var(--lime-1)] hover:bg-[var(--lime-10)]">
                <Download />
                Download .SVG
              </Button>
              <Button
                variant="outline"
                size="icon-lg"
                onClick={copySvg}
                aria-label="Copy SVG markup"
                className="border-[#3a4048] bg-[#20242a] text-[#c7ccd2] hover:bg-[#2a3037]"
              >
                {copyState === "copied" ? <Check className="text-[var(--lime-11)]" /> : <Clipboard />}
              </Button>
            </div>

            <div className="mt-4 flex gap-2.5 border-l-2 border-[var(--lime-9)] bg-[var(--lime-2)] px-3 py-2.5">
              <Grid3X3 className="mt-0.5 size-3.5 shrink-0 text-[var(--lime-11)]" />
              <p className="text-[9px] leading-4 text-[#89929e]">
                Named SVG groups keep every grid family, the mark, synchronized mechanism, math notation, and animation independently editable.
              </p>
            </div>
          </InspectorSection>
        </aside>
      </main>

      <footer className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#2b2f35] bg-[#0d0f12] px-4 py-1.5 font-mono text-[8px] uppercase tracking-[0.13em] text-[#68717d] sm:px-6">
        <span className="text-[#9aa2ad]">DXD / Digital Experience Design</span>
        <span>Equation / Lamé astroid</span>
        <span>Symmetry / C4</span>
        <span className="ml-auto text-[var(--lime-11)]">SVG ready</span>
      </footer>
    </div>
  );
}
