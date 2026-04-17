/**
 * Tweak engine — orchestrates analyze → warp → compose for the Tweaked tab.
 *
 * Uses MLS (Moving Least Squares) similarity warp driven by smart-grid arc
 * samples + TW-semantic enforcements + boundary anchors. Produces a smooth,
 * globally-coherent reshape rather than the per-arc Gaussian patches that
 * caused the "forced/torn" look in earlier iterations.
 */

import type { GridData } from "./grid-generator";
import type { SmartGridResult } from "./smart-grid";
import type { TweakOptions, TweakDiff, TWStructure } from "./use-logo-store";
import { warpImageMLS, buildControlPairs } from "./logo-warp";
import { detectTWStructure } from "./tw-semantics";

export interface TweakCallbacks {
  onAnalyzeDone?: (structure: TWStructure) => void;
  onWarpProgress?: (progress: number) => void;
  onComplete?: (result: ImageData, diff: TweakDiff) => void;
}

export async function runTweakPipeline(
  originalImageData: ImageData,
  gridData: GridData,
  smartGrid: SmartGridResult | null,
  options: TweakOptions,
  callbacks: TweakCallbacks = {}
): Promise<ImageData> {
  await yieldToBrowser();
  const structure = detectTWStructure(gridData, originalImageData);
  callbacks.onAnalyzeDone?.(structure);
  await yieldToBrowser();

  callbacks.onWarpProgress?.(0);
  const strength = options.strength / 100;

  const pairs = buildControlPairs(
    smartGrid,
    structure,
    originalImageData.width,
    originalImageData.height,
    {
      equalizeSquircleCorners: options.equalizeSquircleCorners,
      clampSpiralEye: options.clampSpiralEye,
      bridgeTangent: options.bridgeTangent,
    }
  );

  callbacks.onWarpProgress?.(0.2);
  await yieldToBrowser();

  const result = warpImageMLS(originalImageData, pairs, strength);
  callbacks.onWarpProgress?.(1);
  await yieldToBrowser();

  const diff = computeTweakDiff(originalImageData, result, structure, options);

  callbacks.onComplete?.(result, diff);
  return result;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function computeTweakDiff(
  original: ImageData,
  tweaked: ImageData,
  structure: TWStructure,
  options: TweakOptions
): TweakDiff {
  const n = Math.min(original.data.length, tweaked.data.length);
  let sq = 0;
  let count = 0;
  const stride = 4 * 8;
  for (let i = 0; i < n; i += stride) {
    const dr = original.data[i] - tweaked.data[i];
    const dg = original.data[i + 1] - tweaked.data[i + 1];
    const db = original.data[i + 2] - tweaked.data[i + 2];
    sq += (dr * dr + dg * dg + db * db) / 3;
    count++;
  }
  const rmsDelta = count > 0 ? Math.sqrt(sq / count) : 0;

  return {
    cornersEqualized: options.equalizeSquircleCorners && structure.squircleCorners.length >= 3,
    spiralRounded: options.clampSpiralEye && structure.spiralEye !== null,
    bridgeApplied: options.bridgeTangent && structure.bridge !== null,
    rmsDelta,
  };
}
