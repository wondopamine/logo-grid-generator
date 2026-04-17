import { create } from "zustand";
import type { GridData } from "./grid-generator";
import type { SmartGridResult } from "./smart-grid";

export type ActiveTab = "grid" | "deviation" | "tweaked";
export type TweakStatus = "idle" | "analyzing" | "warping" | "ready" | "error";

export interface TweakOptions {
  equalizeSquircleCorners: boolean;
  clampSpiralEye: boolean;
  bridgeTangent: boolean;
  strength: number; // 0..100
}

export interface TweakDiff {
  cornersEqualized: boolean;
  spiralRounded: boolean;
  bridgeApplied: boolean;
  rmsDelta: number;
}

// Minimal placeholder until tw-semantics.ts is built in phase 4
export interface TWStructure {
  squircleCorners: Array<{ quadrant: "NW" | "NE" | "SE" | "SW"; cx: number; cy: number; r: number; originalR: number }>;
  spiralEye: { cx: number; cy: number; r: number } | null;
  bridge: { cx: number; cy: number; r: number; p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
  outerSquircle: { cx: number; cy: number; r: number } | null;
}

export interface GridSettings {
  fittedCircles: boolean;
  idealCircles: boolean;
  goldenCircles: boolean;
  concentricCircles: boolean;
  boundingCircles: boolean;
  osculatingCircles: boolean;
  cornerRadiusCircles: boolean;
  tangentCircles: boolean;
  keypointCircles: boolean;
  goldenRect: boolean;
  ruleOfThirds: boolean;
  diagonals: boolean;
  baseline: boolean;
  verticalRhythm: boolean;
  constructionLines: boolean;
  opacity: number;
  strokeWidth: number;
  gridColor: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  deviationTolerance: number;
  smartGrid: boolean;
}

interface LogoStore {
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  originalImageData: ImageData | null;
  warpedImageData: ImageData | null;
  tweakedImageData: ImageData | null;
  gridData: GridData | null;
  smartGridResult: SmartGridResult | null;
  deviationMap: Float32Array | null;
  twStructure: TWStructure | null;

  isProcessing: boolean;
  animationProgress: number;
  settings: GridSettings;
  showAnalysis: boolean;

  // Mode
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Tweak flow
  tweakOptions: TweakOptions;
  updateTweakOptions: (partial: Partial<TweakOptions>) => void;
  tweakStatus: TweakStatus;
  setTweakStatus: (s: TweakStatus) => void;
  tweakProgress: number; // 0..1
  setTweakProgress: (p: number) => void;
  tweakedGenerated: boolean;
  setTweakedGenerated: (g: boolean) => void;
  tweakDiff: TweakDiff | null;
  setTweakDiff: (d: TweakDiff | null) => void;

  // Compare slider
  compareSplitX: number; // 0..1
  setCompareSplitX: (x: number) => void;

  setImage: (url: string, element: HTMLImageElement) => void;
  setOriginalImageData: (data: ImageData) => void;
  setWarpedImageData: (data: ImageData | null) => void;
  setTweakedImageData: (data: ImageData | null) => void;
  setGridData: (data: GridData) => void;
  setSmartGridResult: (result: SmartGridResult | null) => void;
  setDeviationMap: (map: Float32Array | null) => void;
  setTWStructure: (s: TWStructure | null) => void;
  setProcessing: (processing: boolean) => void;
  setAnimationProgress: (progress: number) => void;
  updateSettings: (partial: Partial<GridSettings>) => void;
  setShowAnalysis: (show: boolean) => void;
  reset: () => void;
}

const defaultSettings: GridSettings = {
  fittedCircles: true,
  idealCircles: false,
  goldenCircles: false,
  concentricCircles: false,
  boundingCircles: false,
  osculatingCircles: false,
  cornerRadiusCircles: false,
  tangentCircles: false,
  keypointCircles: false,
  goldenRect: true,
  ruleOfThirds: false,
  diagonals: true,
  baseline: false,
  verticalRhythm: false,
  constructionLines: true,
  opacity: 60,
  strokeWidth: 1.5,
  gridColor: "cyan",
  scale: 100,
  offsetX: 0,
  offsetY: 0,
  deviationTolerance: 8,
  smartGrid: true,
};

const defaultTweakOptions: TweakOptions = {
  equalizeSquircleCorners: true,
  clampSpiralEye: true,
  bridgeTangent: true,
  strength: 70,
};

export const useLogoStore = create<LogoStore>((set) => ({
  imageUrl: null,
  imageElement: null,
  originalImageData: null,
  warpedImageData: null,
  tweakedImageData: null,
  gridData: null,
  smartGridResult: null,
  deviationMap: null,
  twStructure: null,
  isProcessing: false,
  animationProgress: 0,
  settings: defaultSettings,
  showAnalysis: false,

  activeTab: "grid",
  setActiveTab: (tab) => set({ activeTab: tab }),

  tweakOptions: defaultTweakOptions,
  updateTweakOptions: (partial) =>
    set((state) => ({
      tweakOptions: { ...state.tweakOptions, ...partial },
      // Invalidate tweaked result when options change
      tweakStatus: state.tweakedGenerated ? "idle" : state.tweakStatus,
    })),
  tweakStatus: "idle",
  setTweakStatus: (s) => set({ tweakStatus: s }),
  tweakProgress: 0,
  setTweakProgress: (p) => set({ tweakProgress: p }),
  tweakedGenerated: false,
  setTweakedGenerated: (g) => set({ tweakedGenerated: g }),
  tweakDiff: null,
  setTweakDiff: (d) => set({ tweakDiff: d }),

  compareSplitX: 0.5,
  setCompareSplitX: (x) => set({ compareSplitX: Math.max(0, Math.min(1, x)) }),

  setImage: (url, element) => set({ imageUrl: url, imageElement: element }),
  setOriginalImageData: (data) => set({ originalImageData: data }),
  setWarpedImageData: (data) => set({ warpedImageData: data }),
  setTweakedImageData: (data) => set({ tweakedImageData: data }),
  setGridData: (data) => set({ gridData: data }),
  setSmartGridResult: (result) => set({ smartGridResult: result }),
  setDeviationMap: (map) => set({ deviationMap: map }),
  setTWStructure: (s) => set({ twStructure: s }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setAnimationProgress: (progress) => set({ animationProgress: progress }),
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
  setShowAnalysis: (show) => set({ showAnalysis: show }),
  reset: () =>
    set({
      imageUrl: null,
      imageElement: null,
      originalImageData: null,
      warpedImageData: null,
      tweakedImageData: null,
      gridData: null,
      smartGridResult: null,
      deviationMap: null,
      twStructure: null,
      isProcessing: false,
      animationProgress: 0,
      settings: defaultSettings,
      showAnalysis: false,
      activeTab: "grid",
      tweakOptions: defaultTweakOptions,
      tweakStatus: "idle",
      tweakProgress: 0,
      tweakedGenerated: false,
      tweakDiff: null,
      compareSplitX: 0.5,
    }),
}));
