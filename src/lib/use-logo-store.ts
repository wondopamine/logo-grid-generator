import { create } from "zustand";
import type { GridData } from "./grid-generator";
import type { SmartGridResult } from "./smart-grid";

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
  warpStrength: number;
  showWarped: boolean;
  deviationMode: boolean;
  deviationTolerance: number;
  smartGrid: boolean;
}

interface LogoStore {
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  originalImageData: ImageData | null;
  warpedImageData: ImageData | null;
  gridData: GridData | null;
  smartGridResult: SmartGridResult | null;
  deviationMap: Float32Array | null;
  isProcessing: boolean;
  animationProgress: number;
  settings: GridSettings;
  showAnalysis: boolean;
  setImage: (url: string, element: HTMLImageElement) => void;
  setOriginalImageData: (data: ImageData) => void;
  setWarpedImageData: (data: ImageData | null) => void;
  setGridData: (data: GridData) => void;
  setSmartGridResult: (result: SmartGridResult | null) => void;
  setDeviationMap: (map: Float32Array | null) => void;
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
  warpStrength: 0,
  showWarped: false,
  deviationMode: false,
  deviationTolerance: 8,
  smartGrid: true,
};

export const useLogoStore = create<LogoStore>((set) => ({
  imageUrl: null,
  imageElement: null,
  originalImageData: null,
  warpedImageData: null,
  gridData: null,
  smartGridResult: null,
  deviationMap: null,
  isProcessing: false,
  animationProgress: 0,
  settings: defaultSettings,
  showAnalysis: false,
  setImage: (url, element) => set({ imageUrl: url, imageElement: element }),
  setOriginalImageData: (data) => set({ originalImageData: data }),
  setWarpedImageData: (data) => set({ warpedImageData: data }),
  setGridData: (data) => set({ gridData: data }),
  setSmartGridResult: (result) => set({ smartGridResult: result }),
  setDeviationMap: (map) => set({ deviationMap: map }),
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
      gridData: null,
      smartGridResult: null,
      deviationMap: null,
      isProcessing: false,
      animationProgress: 0,
      settings: defaultSettings,
      showAnalysis: false,
    }),
}));
