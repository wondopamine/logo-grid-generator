"use client";

import { useCallback, useState } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { useLogoStore } from "@/lib/use-logo-store";
import { detectEdges } from "@/lib/edge-detection";
import { generateGrid } from "@/lib/grid-generator";

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { imageUrl, setImage, setOriginalImageData, setGridData, setProcessing, setAnimationProgress } =
    useLogoStore();

  const processImage = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file (PNG, JPG, or SVG)");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("File too large. Maximum size is 10MB.");
        return;
      }

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

        // Store original image data for warping
        setOriginalImageData(imageData);

        const edgeData = detectEdges(imageData);
        const gridData = generateGrid(edgeData, img.width, img.height, imageData);

        setGridData(gridData);
        setProcessing(false);

        // Animate grid reveal
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

  if (imageUrl) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <div
        className={`
          relative flex flex-col items-center justify-center gap-6 p-12
          border-2 border-dashed rounded-xl transition-all duration-200
          max-w-md w-full mx-8
          ${isDragging
            ? "border-cyan-400 bg-cyan-400/5 scale-[1.02]"
            : "border-neutral-600 hover:border-neutral-500 bg-neutral-900/50"
          }
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="w-14 h-14 rounded-xl bg-neutral-800 flex items-center justify-center">
          {isDragging ? (
            <Upload className="w-6 h-6 text-cyan-400 animate-bounce" />
          ) : (
            <ImageIcon className="w-6 h-6 text-neutral-400" />
          )}
        </div>

        <div className="text-center">
          <p className="text-neutral-200 font-medium mb-1">Drop your logo here</p>
          <p className="text-neutral-500 text-sm">PNG, JPG, or SVG up to 10MB</p>
        </div>

        <label className="cursor-pointer px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium transition-colors">
          Choose file
          <input type="file" className="hidden" accept="image/png,image/jpeg,image/svg+xml" onChange={handleFileInput} />
        </label>

        <div className="mt-4 pt-4 border-t border-neutral-800 w-full">
          <p className="text-neutral-600 text-xs text-center mb-3">Example output</p>
          <div className="flex items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-lg bg-neutral-800 flex items-center justify-center relative overflow-hidden">
              <div className="w-10 h-10 rounded-md bg-blue-600" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(0,200,200,0.3)" strokeWidth="0.8" />
                <circle cx="32" cy="32" r="12" fill="none" stroke="rgba(0,200,200,0.3)" strokeWidth="0.8" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0,200,200,0.2)" strokeWidth="0.5" />
                <line x1="12" y1="12" x2="52" y2="52" stroke="rgba(0,200,200,0.15)" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="52" y1="12" x2="12" y2="52" stroke="rgba(0,200,200,0.15)" strokeWidth="0.5" strokeDasharray="2 2" />
              </svg>
            </div>
            <div className="text-neutral-600 text-xs">
              <span className="text-cyan-500">→</span> Curve-traced grids
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
