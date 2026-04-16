"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { Button } from "@/components/ui/button";
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
import { getCanvasForExport } from "./logo-canvas";

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    imageUrl,
    imageElement,
    gridData,
    warpedImageData,
    isProcessing,
    setImage,
    setOriginalImageData,
    setGridData,
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
        const grid = generateGrid(edgeData, img.width, img.height);

        setGridData(grid);
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
    [setImage, setOriginalImageData, setGridData, setProcessing, setAnimationProgress]
  );

  const handleExport = useCallback(
    (mode: "combined" | "grid-only" | "logo-only" | "warped") => {
      if (!imageElement || !gridData) return;

      const canvas = getCanvasForExport(imageElement, gridData, settings, mode, 2, warpedImageData);
      const link = document.createElement("a");
      link.download = `logo-grid-${mode}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    },
    [imageElement, gridData, settings, warpedImageData]
  );

  return (
    <div className="h-12 bg-[#0a0a0a] border-b border-neutral-800 flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <Grid3X3 className="w-5 h-5 text-cyan-400" />
        <span className="text-sm font-semibold text-neutral-200 hidden sm:inline">
          Logo Grid Generator
        </span>
      </div>

      <div className="flex-1" />

      {isProcessing && (
        <span className="text-xs text-neutral-500 animate-pulse">
          Tracing curves...
        </span>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 bg-neutral-900 border-neutral-700 hover:bg-neutral-800 text-neutral-300"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5" />
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
      />

      {imageUrl && gridData && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="h-8 gap-2 bg-neutral-900 border-neutral-700 hover:bg-neutral-800 text-neutral-300" />}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-700">
              <DropdownMenuItem onClick={() => handleExport("combined")} className="text-neutral-300 focus:bg-neutral-800 focus:text-neutral-200">
                Logo + Grid (PNG 2x)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("grid-only")} className="text-neutral-300 focus:bg-neutral-800 focus:text-neutral-200">
                Grid only (transparent)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("logo-only")} className="text-neutral-300 focus:bg-neutral-800 focus:text-neutral-200">
                Logo only (PNG 2x)
              </DropdownMenuItem>
              {warpedImageData && (
                <DropdownMenuItem onClick={() => handleExport("warped")} className="text-cyan-300 focus:bg-neutral-800 focus:text-cyan-200">
                  Warped logo (Perfectified)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-cyan-950/50 border-cyan-800/50 hover:bg-cyan-900/50 text-cyan-300"
            onClick={() => setShowAnalysis(true)}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Analysis</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-neutral-500 hover:text-neutral-300"
            onClick={reset}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
