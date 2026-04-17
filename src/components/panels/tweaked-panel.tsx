"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Wand2, Download, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useCallback } from "react";
import { runTweakPipeline } from "@/lib/tweak-engine";

export function TweakedPanel() {
  const {
    gridData,
    originalImageData,
    imageElement,
    tweakOptions,
    updateTweakOptions,
    tweakStatus,
    setTweakStatus,
    tweakProgress,
    setTweakProgress,
    tweakedGenerated,
    setTweakedGenerated,
    tweakDiff,
    setTweakDiff,
    setTweakedImageData,
    tweakedImageData,
    twStructure,
    setTWStructure,
  } = useLogoStore();

  const handleGenerate = useCallback(async () => {
    if (!originalImageData || !gridData) return;

    setTweakStatus("analyzing");
    setTweakProgress(0);

    try {
      await runTweakPipeline(
        originalImageData,
        gridData,
        tweakOptions,
        {
          onAnalyzeDone: (structure) => {
            setTWStructure(structure);
            setTweakProgress(0.33);
            setTweakStatus("warping");
          },
          onWarpProgress: (p) => {
            setTweakProgress(0.33 + p * 0.67);
          },
          onComplete: (result, diff) => {
            setTweakedImageData(result);
            setTweakDiff(diff);
            setTweakedGenerated(true);
            setTweakStatus("ready");
            setTweakProgress(1);
          },
        }
      );
    } catch {
      setTweakStatus("error");
    }
  }, [
    originalImageData,
    gridData,
    tweakOptions,
    setTweakStatus,
    setTweakProgress,
    setTWStructure,
    setTweakedImageData,
    setTweakDiff,
    setTweakedGenerated,
  ]);

  const handleDownload = useCallback(() => {
    if (!tweakedImageData || !imageElement) return;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = tweakedImageData.width * scale;
    canvas.height = tweakedImageData.height * scale;
    const ctx = canvas.getContext("2d")!;
    const temp = document.createElement("canvas");
    temp.width = tweakedImageData.width;
    temp.height = tweakedImageData.height;
    temp.getContext("2d")!.putImageData(tweakedImageData, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.download = "logo-tweaked.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [tweakedImageData, imageElement]);

  if (!gridData || !originalImageData) {
    return (
      <div className="p-4">
        <Alert className="bg-neutral-900 border-neutral-800">
          <Info className="w-4 h-4" />
          <AlertTitle className="text-neutral-100">Upload a logo first</AlertTitle>
          <AlertDescription className="text-neutral-300">
            The tweak engine becomes available after the grid is analyzed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isIdle = tweakStatus === "idle" && !tweakedGenerated;
  const isRunning = tweakStatus === "analyzing" || tweakStatus === "warping";
  const isReady = tweakStatus === "ready" || tweakedGenerated;
  const isStale = tweakStatus === "idle" && tweakedGenerated; // options changed since last run

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-neutral-200 leading-relaxed">
        Generate a refined version of your logo where curves snap onto the detected grid
        circles. Compare original vs tweaked on the canvas, then download.
      </p>

      {/* CTA Card */}
      <Card className="p-4 bg-gradient-to-br from-cyan-950/40 to-neutral-900 border-cyan-900/40 space-y-3">
        {isIdle && (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                <Wand2 className="w-5 h-5 text-cyan-300" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-neutral-100 mb-1">Perfectify your logo</h3>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Snap curves to ideal geometry. TW-specific enforcements apply to squircle
                  corners, the spiral eye, and t/w junction.
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              size="lg"
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Tweaked Logo
            </Button>
          </>
        )}

        {isRunning && (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                <Wand2 className="w-5 h-5 text-cyan-300 animate-pulse" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-neutral-100 mb-1">
                  {tweakStatus === "analyzing" ? "Analyzing geometry..." : "Generating tweaks..."}
                </h3>
                <p className="text-xs text-neutral-300" role="status" aria-live="polite">
                  {tweakStatus === "analyzing"
                    ? "Detecting squircle corners, spiral eye, and junction points"
                    : "Warping curves toward ideal circles"}
                </p>
              </div>
            </div>
            <Progress value={Math.round(tweakProgress * 100)} aria-label="Tweak progress" />
          </>
        )}

        {isReady && (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-400" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-neutral-100 mb-1">Tweaked logo ready</h3>
                <p className="text-xs text-neutral-300">
                  Drag the divider on the canvas to compare original vs tweaked.
                </p>
              </div>
            </div>

            {/* Diff badges */}
            {tweakDiff && (
              <div className="flex flex-wrap gap-1.5">
                {tweakDiff.cornersEqualized && (
                  <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-300 border-0">
                    Corners equalized
                  </Badge>
                )}
                {tweakDiff.spiralRounded && (
                  <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-300 border-0">
                    Spiral rounded
                  </Badge>
                )}
                {tweakDiff.bridgeApplied && (
                  <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-300 border-0">
                    Bridge applied
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs bg-neutral-800 text-neutral-300 border-0 font-mono">
                  RMS Δ {tweakDiff.rmsDelta.toFixed(1)}px
                </Badge>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleDownload}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PNG
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerate}
                className="border-neutral-700 hover:bg-neutral-800 text-neutral-200"
              >
                Regenerate
              </Button>
            </div>
          </>
        )}

        {tweakStatus === "error" && (
          <Alert className="bg-red-950/40 border-red-900/60">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <AlertTitle className="text-red-200 text-sm">Tweak failed</AlertTitle>
            <AlertDescription className="text-red-300/80 text-xs">
              Something went wrong. Try regenerating with different options.
            </AlertDescription>
          </Alert>
        )}
      </Card>

      {isStale && (
        <Alert className="bg-amber-950/40 border-amber-900/60">
          <Info className="w-4 h-4 text-amber-400" />
          <AlertTitle className="text-amber-200 text-sm">Options changed</AlertTitle>
          <AlertDescription className="text-amber-300/80 text-xs">
            Click Regenerate to apply the new settings.
          </AlertDescription>
        </Alert>
      )}

      {/* Algorithm options */}
      <Card className="p-4 bg-neutral-900 border-neutral-800 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-100">Enforcements</h3>

        <div className="space-y-3">
          <TweakToggle
            label="Equalize squircle corners"
            description="Force the 4 outer corners to share the same radius"
            checked={tweakOptions.equalizeSquircleCorners}
            onChange={(v) => updateTweakOptions({ equalizeSquircleCorners: v })}
          />
          <TweakToggle
            label="Clamp spiral eye"
            description="Snap the w-spiral center onto a perfect circle"
            checked={tweakOptions.clampSpiralEye}
            onChange={(v) => updateTweakOptions({ clampSpiralEye: v })}
          />
          <TweakToggle
            label="Apply tangent bridge"
            description="Smooth the t/w junction with a bridge circle"
            checked={tweakOptions.bridgeTangent}
            onChange={(v) => updateTweakOptions({ bridgeTangent: v })}
          />
        </div>

        <div className="pt-3 border-t border-neutral-800">
          <Label className="text-sm text-neutral-200 mb-2 block">
            Strength: {tweakOptions.strength}%
          </Label>
          <Slider
            value={[tweakOptions.strength]}
            onValueChange={(v) => updateTweakOptions({ strength: Array.isArray(v) ? v[0] : v })}
            min={0}
            max={100}
            step={5}
            className="w-full"
            aria-label={`Tweak strength: ${tweakOptions.strength} percent`}
          />
          <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
            Lower = subtle refinement. Higher = full grid snap.
          </p>
        </div>
      </Card>

      {twStructure && (
        <Card className="p-3 bg-neutral-900 border-neutral-800 text-sm text-neutral-300 space-y-1">
          <div className="flex justify-between">
            <span>Squircle corners</span>
            <span className="text-neutral-100 font-mono">{twStructure.squircleCorners.length}/4</span>
          </div>
          <div className="flex justify-between">
            <span>Spiral eye</span>
            <span className="text-neutral-100 font-mono">{twStructure.spiralEye ? "detected" : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>Bridge tangent</span>
            <span className="text-neutral-100 font-mono">{twStructure.bridge ? "detected" : "—"}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function TweakToggle({
  label, description, checked, onChange,
}: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  const id = `tweak-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm text-neutral-100 cursor-pointer">
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />
      </div>
      <p className="text-xs text-neutral-300 mt-1">{description}</p>
    </div>
  );
}
