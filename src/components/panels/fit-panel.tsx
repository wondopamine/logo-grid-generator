"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Target, Info, Sparkles, Wand2 } from "lucide-react";
import { useMemo } from "react";

export function FitPanel() {
  const { smartGridResult, twStructure, setActiveTab } = useLogoStore();

  const ranked = useMemo(() => {
    if (!smartGridResult) return null;
    const sorted = [...smartGridResult.circles]
      .map((c, i) => ({ ...c, rank: i }))
      .sort((a, b) => b.explainedCount - a.explainedCount);
    const matching = sorted.slice(0, Math.min(6, sorted.length));
    return { matching, total: sorted.length };
  }, [smartGridResult]);

  if (!smartGridResult || !ranked) {
    return (
      <div className="p-4">
        <Alert className="bg-neutral-900 border-neutral-800">
          <Info className="w-4 h-4" />
          <AlertTitle className="text-neutral-100">Upload a logo first</AlertTitle>
          <AlertDescription className="text-neutral-300">
            The best-fit grid becomes available after the logo is analyzed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const corners = twStructure?.squircleCorners.length ?? 0;
  const hasEye = !!twStructure?.spiralEye;
  const hasBridge = !!twStructure?.bridge;
  const helpfulCount = corners + (hasEye ? 1 : 0) + (hasBridge ? 1 : 0);

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-neutral-200 leading-relaxed">
        The most useful grid circles for this logo — what it currently aligns
        with, plus targeted helpers that would tighten the composition.
      </p>

      {/* Matching grid */}
      <Card className="p-4 bg-neutral-900 border-neutral-800 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-green-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-neutral-100 flex-1">
            Currently matching
          </h3>
          <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-300 border-0">
            {ranked.matching.length} circles
          </Badge>
        </div>
        <p className="text-xs text-neutral-300 leading-relaxed">
          Smart-grid circles, ranked by how much of your logo they explain.
        </p>
        <ul className="space-y-1.5 text-xs font-mono">
          {ranked.matching.map((c, i) => (
            <li key={i} className="flex items-center justify-between text-neutral-200">
              <span className="text-neutral-400">#{i + 1}</span>
              <span>r = {c.r.toFixed(1)}px</span>
              <span className="text-neutral-400">
                {Math.round(c.arcCoverage * 100)}% arc
              </span>
              <span className="text-green-400">
                {c.explainedCount} edges
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Helpful grid */}
      <Card className="p-4 bg-neutral-900 border-neutral-800 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-neutral-100 flex-1">
            Potentially helpful
          </h3>
          <Badge variant="secondary" className="text-xs bg-cyan-500/15 text-cyan-300 border-0">
            {helpfulCount} targets
          </Badge>
        </div>
        <p className="text-xs text-neutral-300 leading-relaxed">
          Ideal TW-style anchors. Your logo is close to these — aligning with
          them would tighten the overall structure.
        </p>
        <ul className="space-y-1.5 text-xs text-neutral-200">
          <li className="flex items-center justify-between">
            <span className="text-neutral-300">Outer squircle corners</span>
            <span className="font-mono">
              {corners > 0 ? `${corners} / 4` : "not detected"}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-neutral-300">Spiral eye (w)</span>
            <span className="font-mono">
              {hasEye ? `r = ${twStructure!.spiralEye!.r.toFixed(1)}px` : "not detected"}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-neutral-300">t/w junction bridge</span>
            <span className="font-mono">
              {hasBridge ? `r = ${twStructure!.bridge!.r.toFixed(1)}px` : "not detected"}
            </span>
          </li>
        </ul>
      </Card>

      {/* CTA */}
      <Alert className="bg-cyan-950/40 border-cyan-900/60">
        <Wand2 className="w-4 h-4 text-cyan-400" />
        <AlertTitle className="text-cyan-100 text-sm">Want to apply these?</AlertTitle>
        <AlertDescription className="text-cyan-200/80 text-xs mb-2">
          The Tweaked tab morphs your logo so the matching circles stay put and
          the helpful ones become true tangents.
        </AlertDescription>
        <button
          onClick={() => setActiveTab("tweaked")}
          className="mt-2 text-xs font-semibold text-cyan-200 hover:text-cyan-100 underline underline-offset-2"
        >
          Open Tweaked tab →
        </button>
      </Alert>

      {/* Legend */}
      <Alert className="bg-neutral-900 border-neutral-800">
        <Info className="w-4 h-4" />
        <AlertTitle className="text-neutral-100 text-sm">Canvas legend</AlertTitle>
        <AlertDescription className="text-neutral-300 text-xs space-y-1.5 mt-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-green-400" />
            <span>Currently matching circle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-cyan-400 border-dashed" />
            <span>Helpful target (ideal anchor)</span>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
