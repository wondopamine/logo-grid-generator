/**
 * Tweak engine — orchestrates analyze → warp → compose for the Tweaked tab.
 *
 * Phase 3 uses the existing warpImage() with fitted/ideal circles.
 * Phase 4 will upgrade to warpWithTW() that uses the TW semantic layer.
 */

import type { GridData } from "./grid-generator";
import type { TweakOptions, TweakDiff, TWStructure } from "./use-logo-store";
import { warpImage } from "./logo-warp";
import { detectTWStructure } from "./tw-semantics";

export interface TweakCallbacks {
  onAnalyzeDone?: (structure: TWStructure) => void;
  onWarpProgress?: (progress: number) => void;
  onComplete?: (result: ImageData, diff: TweakDiff) => void;
}

/**
 * Run the full pipeline. Uses requestAnimationFrame + requestIdleCallback
 * to keep the UI responsive during heavy computation.
 */
export async function runTweakPipeline(
  originalImageData: ImageData,
  gridData: GridData,
  options: TweakOptions,
  callbacks: TweakCallbacks = {}
): Promise<ImageData> {
  // Phase 1: detect TW structure
  await yieldToBrowser();
  const structure = detectTWStructure(gridData, originalImageData);
  callbacks.onAnalyzeDone?.(structure);
  await yieldToBrowser();

  // Phase 2: warp — reuse the existing warp engine.
  // Future (Phase 4): swap for warpWithTW that uses structure-specific displacements.
  callbacks.onWarpProgress?.(0);
  const strength = options.strength / 100;
  const result = warpImage(
    originalImageData,
    gridData.fittedCircles,
    gridData.idealCircles,
    strength
  );
  callbacks.onWarpProgress?.(1);
  await yieldToBrowser();

  // Phase 3: compute diff summary
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
  // RMS delta across all pixels (quick perceptual proxy)
  const n = Math.min(original.data.length, tweaked.data.length);
  let sq = 0;
  let count = 0;
  const stride = 4 * 8; // sample every 8th pixel to keep this fast
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
