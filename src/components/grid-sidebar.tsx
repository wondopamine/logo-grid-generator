"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ChevronDown, Sparkles } from "lucide-react";
import { useState, useCallback } from "react";
import { warpImage } from "@/lib/logo-warp";

function Section({
  title, children, defaultOpen = true, icon, description,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  icon?: React.ReactNode; description?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-neutral-800/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-neutral-800/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          {icon}
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {description && (
            <p className="text-xs text-neutral-400 mb-3 leading-relaxed">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function GridToggle({
  label, checked, onChange, score, description,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
  score?: number; description?: string;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Switch checked={checked} onCheckedChange={onChange} className="scale-[0.8]" />
          <span className="text-[13px] text-neutral-200">{label}</span>
        </div>
        {score !== undefined && score > 0 && (
          <span className="text-xs font-mono text-neutral-500">{score}%</span>
        )}
      </div>
      {description && (
        <p className="text-xs text-neutral-400 ml-9 mt-1 leading-relaxed">{description}</p>
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

export function GridSidebar() {
  const { gridData, smartGridResult, settings, updateSettings, originalImageData, setWarpedImageData } = useLogoStore();

  const handleWarpChange = useCallback((strength: number) => {
    updateSettings({ warpStrength: strength, showWarped: strength > 0 });
    if (strength > 0 && originalImageData && gridData) {
      const warped = warpImage(originalImageData, gridData.fittedCircles, gridData.idealCircles, strength / 100);
      setWarpedImageData(warped);
    } else {
      setWarpedImageData(null);
    }
  }, [originalImageData, gridData, updateSettings, setWarpedImageData]);

  return (
    <div className="w-[300px] bg-[#141414] border-l border-neutral-800 overflow-y-auto flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-200 tracking-wide">Grid Controls</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Perfectify */}
        {gridData && gridData.fittedCircles.length > 0 && (
          <Section title="Perfectify" icon={<Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
            description="Warp your logo so its curves snap onto perfect geometric circles. Makes the logo look intentionally designed on a mathematical grid.">
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-neutral-400 mb-2 block">Warp: {settings.warpStrength}%</Label>
                <Slider value={[settings.warpStrength]} onValueChange={(v) => handleWarpChange(Array.isArray(v) ? v[0] : v)} min={0} max={100} step={5} className="w-full" />
              </div>
              <GridToggle label="Show warped" checked={settings.showWarped} onChange={(v) => updateSettings({ showWarped: v })} description="Compare original vs warped version" />
            </div>
          </Section>
        )}

        {/* Smart Grid */}
        <Section title="Smart Grid" defaultOpen={true}
          description="Sliding-window analysis that finds the best set of circles explaining your logo's geometry. Circles are ranked by how much of the logo they account for.">
          <div className="space-y-1">
            <GridToggle label="Smart Circles" checked={settings.smartGrid} onChange={(v) => updateSettings({ smartGrid: v })}
              score={smartGridResult?.coveragePercent}
              description="Circles selected by explanation power, not just curve fitting" />
          </div>
          {smartGridResult && (
            <div className="mt-3 p-2.5 rounded-lg bg-neutral-800/50 text-xs text-neutral-400 space-y-1">
              <div className="flex justify-between">
                <span>Circles found</span>
                <span className="text-neutral-200 font-mono">{smartGridResult.circles.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Edge coverage</span>
                <span className="text-neutral-200 font-mono">{smartGridResult.coveragePercent}%</span>
              </div>
            </div>
          )}
        </Section>

        {/* Deviation Analysis */}
        <Section title="Deviation Analysis" defaultOpen={false}
          description="See where your logo's edges match the grid circles (green) vs where they deviate (red). Helps identify what to tweak.">
          <div className="space-y-3">
            <GridToggle label="Show Deviations" checked={settings.deviationMode} onChange={(v) => updateSettings({ deviationMode: v })}
              description="Green = edges on a circle. Red = edges that deviate." />
            {settings.deviationMode && (
              <div>
                <Label className="text-xs text-neutral-400 mb-2 block">Tolerance: {settings.deviationTolerance}px</Label>
                <Slider value={[settings.deviationTolerance]} onValueChange={(v) => updateSettings({ deviationTolerance: Array.isArray(v) ? v[0] : v })} min={1} max={20} step={1} className="w-full" />
              </div>
            )}
          </div>
        </Section>

        {/* Curve-Traced Circles */}
        <Section title="Curve-Traced Circles" defaultOpen={false}
          description="Circles fitted to the actual curves in your logo using least-squares math. Each circle traces a real arc in the letterform.">
          <div className="space-y-1">
            <GridToggle label="Fitted Circles" checked={settings.fittedCircles} onChange={(v) => updateSettings({ fittedCircles: v })} score={gridData?.scores.gridAlignment}
              description="Circles tracing your logo's actual curves (Kasa method)" />
            <GridToggle label="Ideal (Fibonacci)" checked={settings.idealCircles} onChange={(v) => updateSettings({ idealCircles: v })} score={gridData?.scores.goldenRatio}
              description="Same circles with radii snapped to Fibonacci ratios (1, 2, 3, 5, 8, 13...)" />
            <GridToggle label="Osculating Circles" checked={settings.osculatingCircles} onChange={(v) => updateSettings({ osculatingCircles: v })}
              description="Circle of curvature at each arc's tightest bend. Radius = 1/curvature." />
            <GridToggle label="Corner Radii" checked={settings.cornerRadiusCircles} onChange={(v) => updateSettings({ cornerRadiusCircles: v })}
              description="Turning radius at each corner where curves meet" />
            <GridToggle label="Construction Lines" checked={settings.constructionLines} onChange={(v) => updateSettings({ constructionLines: v })}
              description="Lines connecting circle centers, showing structural relationships" />
          </div>
        </Section>

        {/* Compositional Circles */}
        <Section title="Compositional Circles"
          description="Circles for proportion reference and spatial balance. Toggle these to find the right visual framework for your logo.">
          <div className="space-y-1">
            <GridToggle label="Golden Ratio" checked={settings.goldenCircles} onChange={(v) => updateSettings({ goldenCircles: v })}
              description="Fibonacci radii from center of mass (1, 1, 2, 3, 5, 8, 13, 21)" />
            <GridToggle label="Concentric" checked={settings.concentricCircles} onChange={(v) => updateSettings({ concentricCircles: v })}
              description="Evenly spaced rings for checking radial balance" />
            <GridToggle label="Bounding / Inscribed" checked={settings.boundingCircles} onChange={(v) => updateSettings({ boundingCircles: v })}
              description="Smallest circle enclosing the logo (Welzl algorithm) + largest circle fitting inside" />
            <GridToggle label="Tangent Circles" checked={settings.tangentCircles} onChange={(v) => updateSettings({ tangentCircles: v })}
              description="Circles tangent to pairs of fitted circles (Apollonius construction)" />
            <GridToggle label="Keypoint Circles" checked={settings.keypointCircles} onChange={(v) => updateSettings({ keypointCircles: v })}
              description="Circumscribed circles through boundary extreme points" />
          </div>
        </Section>

        {/* Geometric Grids */}
        <Section title="Geometric Grids"
          description="Classical layout grids for proportion and visual balance.">
          <div className="space-y-1">
            <GridToggle label="Golden Rectangle" checked={settings.goldenRect} onChange={(v) => updateSettings({ goldenRect: v })}
              description="Bounding box subdivided by the golden ratio (1:1.618)" />
            <GridToggle label="Rule of Thirds" checked={settings.ruleOfThirds} onChange={(v) => updateSettings({ ruleOfThirds: v })}
              description="9-part grid. Key elements should sit at intersections." />
            <GridToggle label="Diagonals" checked={settings.diagonals} onChange={(v) => updateSettings({ diagonals: v })}
              description="Corner-to-corner diagonals and center axes" />
            <GridToggle label="Horizontal Baseline" checked={settings.baseline} onChange={(v) => updateSettings({ baseline: v })}
              description="Horizontal lines at 1/8 intervals" />
            <GridToggle label="Vertical Rhythm" checked={settings.verticalRhythm} onChange={(v) => updateSettings({ verticalRhythm: v })}
              description="Vertical lines at 1/8 intervals" />
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance" description="Control how the grid overlay looks.">
          <div className="space-y-5">
            <div>
              <Label className="text-xs text-neutral-400 mb-2 block">Opacity: {settings.opacity}%</Label>
              <Slider value={[settings.opacity]} onValueChange={(v) => updateSettings({ opacity: Array.isArray(v) ? v[0] : v })} min={10} max={100} step={5} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-400 mb-2 block">Stroke: {settings.strokeWidth}px</Label>
              <Slider value={[settings.strokeWidth * 10]} onValueChange={(v) => updateSettings({ strokeWidth: (Array.isArray(v) ? v[0] : v) / 10 })} min={5} max={30} step={1} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-400 mb-2 block">Scale: {settings.scale}%</Label>
              <Slider value={[settings.scale]} onValueChange={(v) => updateSettings({ scale: Array.isArray(v) ? v[0] : v })} min={50} max={150} step={1} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-400 mb-2 block">Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button key={opt.key} onClick={() => updateSettings({ gridColor: opt.key })}
                    className={`w-8 h-8 rounded-lg border-2 transition-all ${settings.gridColor === opt.key ? "border-white scale-110" : "border-neutral-700 hover:border-neutral-500"}`}
                    style={{ backgroundColor: opt.color }} title={opt.label} />
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-neutral-400 mb-2 block">Offset X: {settings.offsetX}px</Label>
              <Slider value={[settings.offsetX]} onValueChange={(v) => updateSettings({ offsetX: Array.isArray(v) ? v[0] : v })} min={-100} max={100} step={1} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-400 mb-2 block">Offset Y: {settings.offsetY}px</Label>
              <Slider value={[settings.offsetY]} onValueChange={(v) => updateSettings({ offsetY: Array.isArray(v) ? v[0] : v })} min={-100} max={100} step={1} className="w-full" />
            </div>
          </div>
        </Section>
      </div>

      {/* Analysis */}
      {gridData && (
        <div className="border-t border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-neutral-200">Analysis</h3>
            <span className="text-xs text-neutral-500">{gridData.fittedCircles.length} circles</span>
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
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-neutral-400">{label}</span>
        <span className="font-mono font-medium text-neutral-200">{value}%</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
