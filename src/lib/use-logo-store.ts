import { create } from "zustand";
import type { GridData } from "./grid-generator";

export interface GridSettings {
  goldenCircles: boolean;
  concentricCircles: boolean;
  tangentCircles: boolean;
  goldenRect: boolean;
  ruleOfThirds: boolean;
  diagonals: boolean;
  baseline: boolean;
  verticalRhythm: boolean;
  opacity: number;
  strokeWidth: number;
  gridColor: string;
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface LogoStore {
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  gridData: GridData | null;
  isProcessing: boolean;
  animationProgress: number;
  settings: GridSettings;
  showAnalysis: boolean;
  setImage: (url: string, element: HTMLImageElement) => void;
  setGridData: (data: GridData) => void;
  setProcessing: (processing: boolean) => void;
  setAnimationProgress: (progress: number) => void;
  updateSettings: (partial: Partial<GridSettings>) => void;
  setShowAnalysis: (show: boolean) => void;
  reset: () => void;
}

const defaultSettings: GridSettings = {
  goldenCircles: true,
  concentricCircles: false,
  tangentCircles: false,
  goldenRect: true,
  ruleOfThirds: false,
  diagonals: true,
  baseline: false,
  verticalRhythm: false,
  opacity: 60,
  strokeWidth: 1.5,
  gridColor: "cyan",
  scale: 100,
  offsetX: 0,
  offsetY: 0,
};

export const useLogoStore = create<LogoStore>((set) => ({
  imageUrl: null,
  imageElement: null,
  gridData: null,
  isProcessing: false,
  animationProgress: 0,
  settings: defaultSettings,
  showAnalysis: false,
  setImage: (url, element) => set({ imageUrl: url, imageElement: element }),
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
      gridData: null,
      isProcessing: false,
      animationProgress: 0,
      settings: defaultSettings,
      showAnalysis: false,
    }),
}));
