"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, ChevronDown } from "lucide-react";
import { useState } from "react";

function Section({
  title, children, defaultOpen = true, icon, description,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  icon?: React.ReactNode; description?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = title.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="border-b border-neutral-800/60">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`section-${id}`}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-neutral-800/40 focus-visible:bg-neutral-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-inset transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          {icon}
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={`section-${id}`} className="px-4 pb-4">
          {description && (
            <p className="text-sm text-neutral-300 mb-3 leading-relaxed">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function GridToggle({
  label, checked, onChange, score, description, id,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
  score?: number; description?: string; id?: string;
}) {
  const toggleId = id ?? `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-1">
          <Switch
            id={toggleId}
            checked={checked}
            onCheckedChange={onChange}
            className="scale-[0.85]"
            aria-label={label}
          />
          <Label htmlFor={toggleId} className="text-sm text-neutral-100 cursor-pointer">
            {label}
          </Label>
        </div>
        {score !== undefined && score > 0 && (
          <Badge variant="secondary" className="text-xs font-mono text-neutral-300 bg-neutral-800 border-0">
            {score}%
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-xs text-neutral-300 ml-10 mt-1.5 leading-relaxed">{description}</p>
      )}
    </div>
  );
}

const COLOR_OPTIONS = [
  { key: "cyan", label: "Cyan", color: "#22d3ee" },
  { key: "green", label: "Green", color: "#4ade80" },
  { key: "white", label: "White", color: "#e5e5e5" },
  { key: "orange", label: "Orange", color: "#fb923c" },
];

export function GridPanel() {
  const { gridData, smartGridResult, settings, updateSettings } = useLogoStore();

  return (
    <div className="flex flex-col">
      <div className="flex-1">
        {/* Smart Grid */}
        <Section
          title="Smart Grid"
          icon={<Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" />}
          description="Sliding-window analysis that finds the best set of circles explaining your logo's geometry, ranked by how much of the logo they account for."
        >
          <div className="space-y-1">
            <GridToggle
              label="Smart Circles"
              checked={settings.smartGrid}
              onChange={(v) => updateSettings({ smartGrid: v })}
              score={smartGridResult?.coveragePercent}
              description="Circles selected by explanation power, not just curve fitting"
            />
          </div>
          {smartGridResult && (
            <Card className="mt-3 p-3 bg-neutral-900 border-neutral-800 text-neutral-200 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-300">Circles found</span>
                <span className="font-mono text-neutral-100">{smartGridResult.circles.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-300">Edge coverage</span>
                <span className="font-mono text-neutral-100">{smartGridResult.coveragePercent}%</span>
              </div>
            </Card>
          )}
        </Section>

        {/* Curve-Traced Circles */}
        <Section
          title="Curve-Traced"
          defaultOpen={false}
          description="Circles fitted to your logo's actual curves using least-squares math. Each traces a real arc in the letterform."
        >
          <div className="space-y-0">
            <GridToggle label="Fitted Circles" checked={settings.fittedCircles} onChange={(v) => updateSettings({ fittedCircles: v })} score={gridData?.scores.gridAlignment}
              description="Circles tracing your logo's actual curves (Kasa method)" />
            <GridToggle label="Ideal (Fibonacci)" checked={settings.idealCircles} onChange={(v) => updateSettings({ idealCircles: v })} score={gridData?.scores.goldenRatio}
              description="Radii snapped to Fibonacci ratios (1, 2, 3, 5, 8, 13...)" />
            <GridToggle label="Osculating" checked={settings.osculatingCircles} onChange={(v) => updateSettings({ osculatingCircles: v })}
              description="Circle of curvature at each arc's tightest bend. Radius = 1/curvature." />
            <GridToggle label="Corner Radii" checked={settings.cornerRadiusCircles} onChange={(v) => updateSettings({ cornerRadiusCircles: v })}
              description="Turning radius at each corner where curves meet" />
            <GridToggle label="Construction Lines" checked={settings.constructionLines} onChange={(v) => updateSettings({ constructionLines: v })}
              description="Lines connecting circle centers, showing structural relationships" />
          </div>
        </Section>

        {/* Compositional */}
        <Section
          title="Compositional"
          defaultOpen={false}
          description="Reference circles for proportion and spatial balance. Use these to find the right visual framework."
        >
          <div className="space-y-0">
            <GridToggle label="Golden Ratio" checked={settings.goldenCircles} onChange={(v) => updateSettings({ goldenCircles: v })}
              description="Fibonacci radii from the geometric center (1, 1, 2, 3, 5, 8, 13, 21)" />
            <GridToggle label="Concentric" checked={settings.concentricCircles} onChange={(v) => updateSettings({ concentricCircles: v })}
              description="Evenly spaced rings for checking radial balance" />
            <GridToggle label="Bounding / Inscribed" checked={settings.boundingCircles} onChange={(v) => updateSettings({ boundingCircles: v })}
              description="Smallest enclosing circle (Welzl) + largest inscribed circle" />
            <GridToggle label="Tangent Circles" checked={settings.tangentCircles} onChange={(v) => updateSettings({ tangentCircles: v })}
              description="Circles tangent to pairs of fitted arcs (Apollonius)" />
            <GridToggle label="Keypoint Circles" checked={settings.keypointCircles} onChange={(v) => updateSettings({ keypointCircles: v })}
              description="Circumscribed circles through boundary extreme points" />
          </div>
        </Section>

        {/* Geometric Grids */}
        <Section
          title="Geometric"
          defaultOpen={false}
          description="Classical layout grids for proportion and visual balance."
        >
          <div className="space-y-0">
            <GridToggle label="Golden Rectangle" checked={settings.goldenRect} onChange={(v) => updateSettings({ goldenRect: v })}
              description="Bounding box subdivided by the golden ratio (1:1.618)" />
            <GridToggle label="Rule of Thirds" checked={settings.ruleOfThirds} onChange={(v) => updateSettings({ ruleOfThirds: v })}
              description="9-part grid — key elements should sit at intersections" />
            <GridToggle label="Diagonals" checked={settings.diagonals} onChange={(v) => updateSettings({ diagonals: v })}
              description="Corner-to-corner diagonals and center axes" />
            <GridToggle label="Horizontal Baseline" checked={settings.baseline} onChange={(v) => updateSettings({ baseline: v })}
              description="Horizontal lines at 1/8 intervals" />
            <GridToggle label="Vertical Rhythm" checked={settings.verticalRhythm} onChange={(v) => updateSettings({ verticalRhythm: v })}
              description="Vertical lines at 1/8 intervals" />
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance" defaultOpen={false} description="Control how the grid overlay looks.">
          <div className="space-y-5">
            <div>
              <Label className="text-sm text-neutral-200 mb-2 block">Opacity: {settings.opacity}%</Label>
              <Slider
                value={[settings.opacity]}
                onValueChange={(v) => updateSettings({ opacity: Array.isArray(v) ? v[0] : v })}
                min={10} max={100} step={5} className="w-full"
                aria-label={`Grid opacity: ${settings.opacity} percent`}
              />
            </div>
            <div>
              <Label className="text-sm text-neutral-200 mb-2 block">Stroke: {settings.strokeWidth}px</Label>
              <Slider
                value={[settings.strokeWidth * 10]}
                onValueChange={(v) => updateSettings({ strokeWidth: (Array.isArray(v) ? v[0] : v) / 10 })}
                min={5} max={30} step={1} className="w-full"
                aria-label={`Stroke width: ${settings.strokeWidth} pixels`}
              />
            </div>
            <div>
              <Label className="text-sm text-neutral-200 mb-2 block">Scale: {settings.scale}%</Label>
              <Slider
                value={[settings.scale]}
                onValueChange={(v) => updateSettings({ scale: Array.isArray(v) ? v[0] : v })}
                min={50} max={150} step={1} className="w-full"
                aria-label={`Grid scale: ${settings.scale} percent`}
              />
            </div>
            <div>
              <Label className="text-sm text-neutral-200 mb-2 block">Color</Label>
              <div className="flex gap-2" role="radiogroup" aria-label="Grid color">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateSettings({ gridColor: opt.key })}
                    role="radio"
                    aria-checked={settings.gridColor === opt.key}
                    aria-label={opt.label}
                    className={`w-9 h-9 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414] ${
                      settings.gridColor === opt.key
                        ? "border-white scale-110"
                        : "border-neutral-700 hover:border-neutral-500"
                    }`}
                    style={{ backgroundColor: opt.color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Position" defaultOpen={false} description="Fine-tune grid placement.">
          <div className="space-y-5">
            <div>
              <Label className="text-sm text-neutral-200 mb-2 block">Offset X: {settings.offsetX}px</Label>
              <Slider
                value={[settings.offsetX]}
                onValueChange={(v) => updateSettings({ offsetX: Array.isArray(v) ? v[0] : v })}
                min={-100} max={100} step={1} className="w-full"
                aria-label={`Horizontal offset: ${settings.offsetX} pixels`}
              />
            </div>
            <div>
              <Label className="text-sm text-neutral-200 mb-2 block">Offset Y: {settings.offsetY}px</Label>
              <Slider
                value={[settings.offsetY]}
                onValueChange={(v) => updateSettings({ offsetY: Array.isArray(v) ? v[0] : v })}
                min={-100} max={100} step={1} className="w-full"
                aria-label={`Vertical offset: ${settings.offsetY} pixels`}
              />
            </div>
          </div>
        </Section>
      </div>

      {/* Analysis scores footer */}
      {gridData && (
        <div className="border-t border-neutral-800 p-4 space-y-3 bg-neutral-900/40">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-100">Analysis</h3>
            <Badge variant="secondary" className="text-xs bg-neutral-800 text-neutral-200 border-0">
              {gridData.fittedCircles.length} circles
            </Badge>
          </div>
          <ScoreBar label="Golden Ratio" value={gridData.scores.goldenRatio} />
          <ScoreBar label="Symmetry" value={gridData.scores.symmetry} />
          <ScoreBar label="Grid Alignment" value={gridData.scores.gridAlignment} />
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-neutral-200">{label}</span>
        <span className="font-mono font-medium text-neutral-100">{value}%</span>
      </div>
      <div
        className="h-2 bg-neutral-800 rounded-full overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
