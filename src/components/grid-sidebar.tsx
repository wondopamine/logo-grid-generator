"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

function CollapsibleGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2 px-3 text-xs font-medium text-neutral-400 uppercase tracking-wider hover:text-neutral-300 transition-colors"
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {title}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

function GridToggle({
  label,
  checked,
  onChange,
  score,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  score?: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
        <Label className="text-sm text-neutral-300 cursor-pointer">{label}</Label>
      </div>
      {score !== undefined && score > 0 && (
        <span className="text-[10px] font-mono text-neutral-500">{score}%</span>
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
  const { gridData, settings, updateSettings } = useLogoStore();

  return (
    <div className="w-[280px] bg-[#141414] border-l border-neutral-800 overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-neutral-800">
        <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Grid Controls
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <CollapsibleGroup title="Circle Grids">
          <GridToggle
            label="Golden Ratio"
            checked={settings.goldenCircles}
            onChange={(v) => updateSettings({ goldenCircles: v })}
            score={gridData?.scores.goldenRatio}
          />
          <GridToggle
            label="Concentric"
            checked={settings.concentricCircles}
            onChange={(v) => updateSettings({ concentricCircles: v })}
          />
          <GridToggle
            label="Tangent Curves"
            checked={settings.tangentCircles}
            onChange={(v) => updateSettings({ tangentCircles: v })}
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        <CollapsibleGroup title="Geometric">
          <GridToggle
            label="Golden Rectangle"
            checked={settings.goldenRect}
            onChange={(v) => updateSettings({ goldenRect: v })}
          />
          <GridToggle
            label="Rule of Thirds"
            checked={settings.ruleOfThirds}
            onChange={(v) => updateSettings({ ruleOfThirds: v })}
          />
          <GridToggle
            label="Diagonals"
            checked={settings.diagonals}
            onChange={(v) => updateSettings({ diagonals: v })}
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        <CollapsibleGroup title="Baseline">
          <GridToggle
            label="Horizontal"
            checked={settings.baseline}
            onChange={(v) => updateSettings({ baseline: v })}
          />
          <GridToggle
            label="Vertical Rhythm"
            checked={settings.verticalRhythm}
            onChange={(v) => updateSettings({ verticalRhythm: v })}
          />
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        <CollapsibleGroup title="Appearance">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">
                Opacity: {settings.opacity}%
              </Label>
              <Slider
                value={[settings.opacity]}
                onValueChange={(v) => updateSettings({ opacity: Array.isArray(v) ? v[0] : v })}
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">
                Stroke: {settings.strokeWidth}px
              </Label>
              <Slider
                value={[settings.strokeWidth * 10]}
                onValueChange={(v) => updateSettings({ strokeWidth: (Array.isArray(v) ? v[0] : v) / 10 })}
                min={5}
                max={30}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">
                Scale: {settings.scale}%
              </Label>
              <Slider
                value={[settings.scale]}
                onValueChange={(v) => updateSettings({ scale: Array.isArray(v) ? v[0] : v })}
                min={50}
                max={150}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">Color</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => updateSettings({ gridColor: opt.key })}
                    className={`w-7 h-7 rounded-md border-2 transition-all ${
                      settings.gridColor === opt.key
                        ? "border-white scale-110"
                        : "border-neutral-700 hover:border-neutral-500"
                    }`}
                    style={{ backgroundColor: opt.color }}
                    title={opt.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </CollapsibleGroup>

        <Separator className="bg-neutral-800" />

        <CollapsibleGroup title="Position" defaultOpen={false}>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">
                Offset X: {settings.offsetX}px
              </Label>
              <Slider
                value={[settings.offsetX]}
                onValueChange={(v) => updateSettings({ offsetX: Array.isArray(v) ? v[0] : v })}
                min={-100}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-500 mb-2 block">
                Offset Y: {settings.offsetY}px
              </Label>
              <Slider
                value={[settings.offsetY]}
                onValueChange={(v) => updateSettings({ offsetY: Array.isArray(v) ? v[0] : v })}
                min={-100}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </CollapsibleGroup>
      </div>

      {/* Scores */}
      {gridData && (
        <div className="border-t border-neutral-800 p-3 space-y-2">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Analysis
          </h3>
          <ScoreBar label="Golden Ratio" value={gridData.scores.goldenRatio} />
          <ScoreBar label="Symmetry" value={gridData.scores.symmetry} />
          <ScoreBar label="Grid Alignment" value={gridData.scores.gridAlignment} />
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 70 ? "bg-green-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-400">{label}</span>
        <span className="font-mono text-neutral-300">{value}%</span>
      </div>
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
