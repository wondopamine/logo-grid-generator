"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { useLogoStore } from "@/lib/use-logo-store";
import { detectEdges } from "@/lib/edge-detection";
import { generateGrid } from "@/lib/grid-generator";
import { analyzeSmartGrid, computeDeviationMap } from "@/lib/smart-grid";
import { detectTWStructure } from "@/lib/tw-semantics";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { imageUrl, setImage, setOriginalImageData, setGridData, setSmartGridResult, setDeviationMap, setTWStructure, setProcessing, setAnimationProgress } =
    useLogoStore();

  const processImage = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setErrorMsg("Please upload an image file (PNG, JPG, or SVG)");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg("File too large. Maximum size is 10MB.");
        return;
      }
      setErrorMsg(null);

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
        const gridData = generateGrid(edgeData, img.width, img.height, imageData);

        const smartResult = analyzeSmartGrid(edgeData);
        const devMap = computeDeviationMap(edgeData.edgePoints, smartResult.circles, img.width, img.height);

        const twStructure = detectTWStructure(gridData, imageData);

        setGridData(gridData);
        setSmartGridResult(smartResult);
        setDeviationMap(devMap);
        setTWStructure(twStructure);
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
    [setImage, setOriginalImageData, setGridData, setSmartGridResult, setDeviationMap, setTWStructure, setProcessing, setAnimationProgress]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processImage(file);
    },
    [processImage]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processImage(file);
    },
    [processImage]
  );

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (imageUrl) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop logo here or press Enter to choose a file"
        onClick={openFileDialog}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFileDialog();
          }
        }}
        className={`
          relative flex flex-col items-center justify-center gap-6 p-10
          border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer
          max-w-md w-full mx-8
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a]
          ${isDragging
            ? "border-cyan-400 bg-cyan-400/10 scale-[1.02]"
            : "border-neutral-600 hover:border-cyan-500/60 bg-neutral-900/60"
          }
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="w-16 h-16 rounded-xl bg-neutral-800 flex items-center justify-center">
          {isDragging ? (
            <Upload className="w-7 h-7 text-cyan-300 animate-bounce" aria-hidden="true" />
          ) : (
            <ImageIcon className="w-7 h-7 text-neutral-300" aria-hidden="true" />
          )}
        </div>

        <div className="text-center space-y-1">
          <p className="text-neutral-100 font-semibold text-base">Drop your logo here</p>
          <p className="text-neutral-300 text-sm">PNG, JPG, or SVG up to 10MB</p>
        </div>

        <span
          className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-neutral-950 text-sm font-semibold transition-colors"
        >
          Choose file
        </span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleFileInput}
          aria-label="Select logo file"
        />

        <div className="mt-2 pt-4 border-t border-neutral-800 w-full">
          <p className="text-neutral-400 text-xs text-center mb-3">Example output</p>
          <div className="flex items-center justify-center gap-3" aria-hidden="true">
            <div className="w-16 h-16 rounded-lg bg-neutral-800 flex items-center justify-center relative overflow-hidden">
              <div className="w-10 h-10 rounded-md bg-blue-600" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(0,200,200,0.45)" strokeWidth="0.8" />
                <circle cx="32" cy="32" r="12" fill="none" stroke="rgba(0,200,200,0.45)" strokeWidth="0.8" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0,200,200,0.3)" strokeWidth="0.5" />
                <line x1="12" y1="12" x2="52" y2="52" stroke="rgba(0,200,200,0.2)" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="52" y1="12" x2="12" y2="52" stroke="rgba(0,200,200,0.2)" strokeWidth="0.5" strokeDasharray="2 2" />
              </svg>
            </div>
            <div className="text-neutral-300 text-xs">
              <span className="text-cyan-400 font-bold">→</span> Curve-traced grids
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-md w-full px-8">
          <Alert className="bg-red-950/50 border-red-900/60">
            <AlertCircle className="w-4 h-4 text-red-300" />
            <AlertTitle className="text-red-100 text-sm">Upload failed</AlertTitle>
            <AlertDescription className="text-red-200/80 text-xs">{errorMsg}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
