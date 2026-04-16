"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, Sparkles } from "lucide-react";
import { useState, useCallback } from "react";
import { warpImage } from "@/lib/logo-warp";

function CollapsibleGroup({
  title, children, defaultOpen = true, icon, description,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  icon?: React.ReactNode; description?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider hover:text-neutral-300 transition-colors"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {icon}
        {title}
      </button>
      {description && open && (
        <p className="text-[10px] text-neutral-600 px-3 pb-2 -mt-1">{description}</p>
      )}
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
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
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
          <Label className="text-sm text-neutral-300 cursor-pointer">{label}</Label>
        </div>
        {score !== undefined && score > 0 && (
          <span className="text-[10px] font-mono text-neutral-500">{score}%</span>
        )}
      </div>
      {description && (
        <p className="text-[10px] text-neutral-600 ml-10 mt-0.5">{description}</p>
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
  const {
    gridData, settings, updateSettings,
    originalImageData, setWarpedImageData,
  } = useLogoStore();

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
    <div className="w-[280px] bg-[#141414] border-l border-neutral-800 overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-neutral-800">
        <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Grid Controls
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Perfectify */}
        {gridData && gridData.fittedCircles.length > 0 && (
          <>
            <CollapsibleGroup
              title="Perfectify"
              icon={<Sparkles className="w-3 h-3 text-cyan-400" />}
              description="Subtly warp your logo so its curves snap onto mathematically perfect circles. Makes the logo look intentionally constructed on a geometric grid."
            >
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-neutral-500 mb-2 block">
                    Warp: {settings.warpStrength}%
                  </Label>
                  <Slider
                    value={[settings.warpStrength]}
                    onValueChange={(v) => handleWarpChange(Array.isArray(v) ? v[0] : v)}
                    min={0} max={100} step={5} className="w-full"
                  />
                </div>
                <GridToggle
                  label="Show warped"
                  checked={settings.showWarped}
                  onChange={(v) => updateSettings({ showWarped: v })}
                  description="Compare original vs warped version"
                />
              </div>
            </CollapsibleGroup>
            <Separator className="bg-neutral-800" />
          </>
        )}

        {/* Curve-Traced Circles */}
        <CollapsibleGroup
          title="Curve-Traced Circles"
          description="Circles mathematically fitted to the actual curves in your logo. Each circle traces a specific arc: a corner radius, a letter curve, or a stroke bend."
        >
          <GridToggle
            label="Fitted Circles"
            checked={settings.fittedCircles}
            onChange={(v) => updateSettings({ fittedCircles: v })}
            score={gridData?.scores.gridAlignment}
            description="Circles that trace your logo's actual curves using least-squares fitting"
          />
          <GridToggle
            label="Ideal (Fibonacci)"
            checked={settings.idealCircles}
            onChange={(v) => updateSettings({ idealCircles: v })}
            score={gridData?.scores.goldenRatio}
            description="Same circles with radii snapped to Fibonacci ratios (1, 2, 3, 5, 8, 13...)"
          />
          <GridToggle
            label="Construction Lines"
            checked={settings.constructionLines}
            onChange={(v) => updateSettings({ constructionLines: v })}
            description="Lines connecting circle centers, showing structural relationships"
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        {/* Compositional Circles */}
        <CollapsibleGroup
          title="Compositional Circles"
          description="Overlay circles for visual composition and proportion reference. Useful for tweaking your logo to align with classical proportions."
        >
          <GridToggle
            label="Golden Ratio"
            checked={settings.goldenCircles}
            onChange={(v) => updateSettings({ goldenCircles: v })}
            description="Fibonacci-sequence radii from the logo's center of mass (1, 1, 2, 3, 5, 8, 13, 21)"
          />
          <GridToggle
            label="Concentric"
            checked={settings.concentricCircles}
            onChange={(v) => updateSettings({ concentricCircles: v })}
            description="Evenly spaced rings from center. Useful for checking radial balance."
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        {/* Geometric */}
        <CollapsibleGroup
          title="Geometric Grids"
          description="Classical layout grids used in graphic design to establish proportion and visual balance."
        >
          <GridToggle
            label="Golden Rectangle"
            checked={settings.goldenRect}
            onChange={(v) => updateSettings({ goldenRect: v })}
            description="Bounding box subdivided by the golden ratio (1:1.618). The most harmonious proportion in nature."
          />
          <GridToggle
            label="Rule of Thirds"
            checked={settings.ruleOfThirds}
            onChange={(v) => updateSettings({ ruleOfThirds: v })}
            description="Divides the frame into 9 equal parts. Key elements should sit at intersections."
          />
          <GridToggle
            label="Diagonals"
            checked={settings.diagonals}
            onChange={(v) => updateSettings({ diagonals: v })}
            description="Corner-to-corner diagonals and center axes. Shows dynamic lines of movement."
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        {/* Baseline */}
        <CollapsibleGroup
          title="Baseline Grids"
          defaultOpen={false}
          description="Even spacing grids for checking vertical and horizontal rhythm in your logo."
        >
          <GridToggle
            label="Horizontal"
            checked={settings.baseline}
            onChange={(v) => updateSettings({ baseline: v })}
            description="Horizontal lines at 1/8 intervals. Check if elements align to a consistent baseline."
          />
          <GridToggle
            label="Vertical Rhythm"
            checked={settings.verticalRhythm}
            onChange={(v) => updateSettings({ verticalRhythm: v })}
            description="Vertical lines at 1/8 intervals. Check horizontal spacing consistency."
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        {/* Appearance */}
        <CollapsibleGroup title="Appearance" description="Control how the grid overlay looks.">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Opacity: {settings.opacity}%</Label>
              <Slider value={[settings.opacity]} onValueChange={(v) => updateSettings({ opacity: Array.isArray(v) ? v[0] : v })} min={10} max={100} step={5} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Stroke: {settings.strokeWidth}px</Label>
              <Slider value={[settings.strokeWidth * 10]} onValueChange={(v) => updateSettings({ strokeWidth: (Array.isArray(v) ? v[0] : v) / 10 })} min={5} max={30} step={1} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Scale: {settings.scale}%</Label>
              <Slider value={[settings.scale]} onValueChange={(v) => updateSettings({ scale: Array.isArray(v) ? v[0] : v })} min={50} max={150} step={1} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateSettings({ gridColor: opt.key })}
                    className={`w-7 h-7 rounded-md border-2 transition-all ${settings.gridColor === opt.key ? "border-white scale-110" : "border-neutral-700 hover:border-neutral-500"}`}
                    style={{ backgroundColor: opt.color }}
                    title={opt.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        <CollapsibleGroup title="Position" defaultOpen={false} description="Fine-tune grid placement relative to the logo.">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Offset X: {settings.offsetX}px</Label>
              <Slider value={[settings.offsetX]} onValueChange={(v) => updateSettings({ offsetX: Array.isArray(v) ? v[0] : v })} min={-100} max={100} step={1} className="w-full" />
            </div>
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Offset Y: {settings.offsetY}px</Label>
              <Slider value={[settings.offsetY]} onValueChange={(v) => updateSettings({ offsetY: Array.isArray(v) ? v[0] : v })} min={-100} max={100} step={1} className="w-full" />
            </div>
          </div>
        </CollapsibleGroup>
      </div>

      {/* Scores */}
      {gridData && (
        <div className="border-t border-neutral-800 p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Analysis</h3>
            {gridData.fittedCircles.length > 0 && (
              <span className="text-[10px] text-neutral-600">{gridData.fittedCircles.length} circles found</span>
            )}
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
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-400">{label}</span>
        <span className="font-mono text-neutral-300">{value}%</span>
      </div>
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
