"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Upload, Download, RotateCcw, Share2, Grid3X3 } from "lucide-react";
import { useCallback, useRef } from "react";
import { detectEdges } from "@/lib/edge-detection";
import { generateGrid } from "@/lib/grid-generator";
import { analyzeSmartGrid, computeDeviationMap } from "@/lib/smart-grid";
import { getCanvasForExport } from "./logo-canvas";

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    imageUrl,
    imageElement,
    gridData,
    tweakedImageData,
    tweakedGenerated,
    activeTab,
    isProcessing,
    setImage,
    setOriginalImageData,
    setGridData,
    setSmartGridResult,
    setDeviationMap,
    setProcessing,
    setAnimationProgress,
    setShowAnalysis,
    reset,
  } = useLogoStore();
  const settings = useLogoStore((s) => s.settings);

  const processImage = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) return;

      setProcessing(true);
      setAnimationProgress(0);

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImage(url, img);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(img, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, img.width, img.height);

        setOriginalImageData(imageData);

        const edgeData = detectEdges(imageData);
        const grid = generateGrid(edgeData, img.width, img.height, imageData);
        const smartResult = analyzeSmartGrid(edgeData);
        const devMap = computeDeviationMap(edgeData.edgePoints, smartResult.circles, img.width, img.height);

        setGridData(grid);
        setSmartGridResult(smartResult);
        setDeviationMap(devMap);
        setProcessing(false);

        let start: number | null = null;
        const duration = 2500;
        const animate = (timestamp: number) => {
          if (!start) start = timestamp;
          const progress = Math.min(1, (timestamp - start) / duration);
          setAnimationProgress(progress);
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      };
      img.src = url;
    },
    [setImage, setOriginalImageData, setGridData, setSmartGridResult, setDeviationMap, setProcessing, setAnimationProgress]
  );

  const handleExport = useCallback(
    (mode: "combined" | "grid-only" | "logo-only" | "warped") => {
      if (!imageElement || !gridData) return;
      const canvas = getCanvasForExport(imageElement, gridData, settings, mode, 2, tweakedImageData);
      const link = document.createElement("a");
      link.download = `logo-grid-${mode}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    },
    [imageElement, gridData, settings, tweakedImageData]
  );

  const modeLabel = activeTab === "grid" ? "Grid" : activeTab === "deviation" ? "Deviations" : "Tweaked";

  return (
    <header className="h-14 bg-[#0a0a0a] border-b border-neutral-800 flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2 mr-2">
        <Grid3X3 className="w-5 h-5 text-cyan-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-neutral-100 hidden sm:inline">
          Logo Grid Generator
        </span>
      </div>

      {imageUrl && (
        <Badge variant="secondary" className="bg-neutral-900 text-neutral-200 border-neutral-800 text-xs">
          {modeLabel}
        </Badge>
      )}

      <div className="flex-1" />

      {isProcessing && (
        <span
          role="status"
          aria-live="polite"
          className="text-sm text-neutral-200 animate-pulse"
        >
          Tracing curves...
        </span>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-2 bg-neutral-900 border-neutral-700 hover:bg-neutral-800 text-neutral-100 focus-visible:ring-2 focus-visible:ring-cyan-400"
        onClick={() => fileInputRef.current?.click()}
        aria-label={imageUrl ? "Replace logo" : "Upload logo"}
      >
        <Upload className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">{imageUrl ? "Replace" : "Upload"}</span>
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/svg+xml"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processImage(file);
        }}
        aria-label="Logo file upload"
      />

      {imageUrl && gridData && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 bg-neutral-900 border-neutral-700 hover:bg-neutral-800 text-neutral-100 focus-visible:ring-2 focus-visible:ring-cyan-400"
                  aria-label="Export options"
                />
              }
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-700 text-neutral-100">
              <DropdownMenuItem
                onClick={() => handleExport("combined")}
                className="text-neutral-100 focus:bg-neutral-800 focus:text-neutral-50"
              >
                Logo + Grid (PNG 2x)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("grid-only")}
                className="text-neutral-100 focus:bg-neutral-800 focus:text-neutral-50"
              >
                Grid only (transparent)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("logo-only")}
                className="text-neutral-100 focus:bg-neutral-800 focus:text-neutral-50"
              >
                Logo only (PNG 2x)
              </DropdownMenuItem>
              {tweakedGenerated && tweakedImageData && (
                <DropdownMenuItem
                  onClick={() => handleExport("warped")}
                  className="text-cyan-300 focus:bg-neutral-800 focus:text-cyan-200"
                >
                  Tweaked logo (PNG 2x)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 bg-cyan-950/40 border-cyan-800/50 hover:bg-cyan-900/60 text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-400"
            onClick={() => setShowAnalysis(true)}
            aria-label="Open analysis dialog"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Analysis</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
            onClick={reset}
            aria-label="Reset workspace"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </header>
  );
}
