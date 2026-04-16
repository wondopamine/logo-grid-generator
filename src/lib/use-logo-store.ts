import { create } from "zustand";
import type { GridData } from "./grid-generator";

export interface GridSettings {
  fittedCircles: boolean;
  idealCircles: boolean;
  goldenCircles: boolean;
  concentricCircles: boolean;
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
}

interface LogoStore {
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  originalImageData: ImageData | null;
  warpedImageData: ImageData | null;
  gridData: GridData | null;
  isProcessing: boolean;
  animationProgress: number;
  settings: GridSettings;
  showAnalysis: boolean;
  setImage: (url: string, element: HTMLImageElement) => void;
  setOriginalImageData: (data: ImageData) => void;
  setWarpedImageData: (data: ImageData | null) => void;
  setGridData: (data: GridData) => void;
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
};

export const useLogoStore = create<LogoStore>((set) => ({
  imageUrl: null,
  imageElement: null,
  originalImageData: null,
  warpedImageData: null,
  gridData: null,
  isProcessing: false,
  animationProgress: 0,
  settings: defaultSettings,
  showAnalysis: false,
  setImage: (url, element) => set({ imageUrl: url, imageElement: element }),
  setOriginalImageData: (data) => set({ originalImageData: data }),
  setWarpedImageData: (data) => set({ warpedImageData: data }),
  setGridData: (data) => set({ gridData: data }),
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
      isProcessing: false,
      animationProgress: 0,
      settings: defaultSettings,
      showAnalysis: false,
    }),
}));
