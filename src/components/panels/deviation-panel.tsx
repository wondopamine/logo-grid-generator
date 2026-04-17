"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Info } from "lucide-react";
import { useMemo } from "react";

export function DeviationPanel() {
  const { settings, updateSettings, deviationMap, smartGridResult } = useLogoStore();

  const stats = useMemo(() => {
    if (!deviationMap) return null;
    const tol = settings.deviationTolerance;
    let edgePoints = 0;
    let aligned = 0;
    let totalDev = 0;
    for (let i = 0; i < deviationMap.length; i++) {
      const d = deviationMap[i];
      if (d < 0) continue; // not an edge
      edgePoints++;
      totalDev += d;
      if (d <= tol) aligned++;
    }
    const coverage = edgePoints > 0 ? Math.round((aligned / edgePoints) * 100) : 0;
    const avgDev = edgePoints > 0 ? totalDev / edgePoints : 0;
    return { edgePoints, aligned, coverage, avgDev };
  }, [deviationMap, settings.deviationTolerance]);

  if (!deviationMap || !smartGridResult) {
    return (
      <div className="p-4">
        <Alert className="bg-neutral-900 border-neutral-800">
          <Info className="w-4 h-4" />
          <AlertTitle className="text-neutral-100">Upload a logo first</AlertTitle>
          <AlertDescription className="text-neutral-300">
            Deviation analysis becomes available after the grid is computed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-neutral-200 leading-relaxed">
        See where your logo aligns with the grid and where it drifts off. Adjust tolerance
        to control how strict the matching is.
      </p>

      {/* Coverage card */}
      <Card className="p-4 bg-neutral-900 border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-100">Grid Coverage</h3>
          <Badge
            variant="secondary"
            className={`text-xs border-0 ${
              stats && stats.coverage >= 70
                ? "bg-green-500/20 text-green-300"
                : stats && stats.coverage >= 40
                ? "bg-yellow-500/20 text-yellow-300"
                : "bg-red-500/20 text-red-300"
            }`}
          >
            {stats?.coverage ?? 0}%
          </Badge>
        </div>
        <Progress value={stats?.coverage ?? 0} aria-label={`Grid coverage: ${stats?.coverage ?? 0} percent`} />
        <div className="grid grid-cols-2 gap-3 text-sm pt-1">
          <div>
            <div className="text-neutral-300 text-xs mb-0.5">Aligned edges</div>
            <div className="text-neutral-100 font-mono">{stats?.aligned ?? 0}</div>
          </div>
          <div>
            <div className="text-neutral-300 text-xs mb-0.5">Edge points</div>
            <div className="text-neutral-100 font-mono">{stats?.edgePoints ?? 0}</div>
          </div>
          <div>
            <div className="text-neutral-300 text-xs mb-0.5">Avg deviation</div>
            <div className="text-neutral-100 font-mono">{stats?.avgDev.toFixed(1) ?? "0.0"}px</div>
          </div>
          <div>
            <div className="text-neutral-300 text-xs mb-0.5">Circles</div>
            <div className="text-neutral-100 font-mono">{smartGridResult.circles.length}</div>
          </div>
        </div>
      </Card>

      {/* Tolerance */}
      <div>
        <Label className="text-sm text-neutral-200 mb-2 block">
          Tolerance: {settings.deviationTolerance}px
        </Label>
        <Slider
          value={[settings.deviationTolerance]}
          onValueChange={(v) =>
            updateSettings({ deviationTolerance: Array.isArray(v) ? v[0] : v })
          }
          min={1}
          max={20}
          step={1}
          className="w-full"
          aria-label={`Deviation tolerance: ${settings.deviationTolerance} pixels`}
        />
        <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
          Edge pixels within this distance of a grid circle are marked aligned (green).
          Higher = more forgiving.
        </p>
      </div>

      {/* Legend */}
      <Alert className="bg-neutral-900 border-neutral-800">
        <Info className="w-4 h-4" />
        <AlertTitle className="text-neutral-100 text-sm">Color legend</AlertTitle>
        <AlertDescription className="text-neutral-300 text-xs space-y-1.5 mt-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-green-500" />
            <span>Edge aligned with a grid circle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-red-500" />
            <span>Edge deviates from the nearest circle</span>
          </div>
        </AlertDescription>
      </Alert>

      {stats && stats.coverage < 70 && (
        <Alert className="bg-cyan-950/40 border-cyan-900/60">
          <Info className="w-4 h-4 text-cyan-400" />
          <AlertTitle className="text-cyan-100 text-sm">Want to fix this?</AlertTitle>
          <AlertDescription className="text-cyan-200/80 text-xs">
            Switch to the Tweaked tab to auto-snap your logo&apos;s curves onto the grid circles.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
