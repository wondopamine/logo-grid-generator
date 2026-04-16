"use client";

import { useRef, useEffect, useCallback } from "react";
import { useLogoStore } from "@/lib/use-logo-store";
import type { GridData, FittedCircle, IdealCircle, GridLine, GridRect } from "@/lib/grid-generator";

const GRID_COLORS: Record<string, { fitted: string; ideal: string; line: string; rect: string; construction: string }> = {
  cyan: {
    fitted: "hsla(180, 80%, 60%, VAR)",
    ideal: "hsla(200, 90%, 70%, VAR)",
    line: "hsla(180, 60%, 50%, VAR)",
    rect: "hsla(180, 40%, 40%, VAR)",
    construction: "hsla(180, 30%, 40%, VAR)",
  },
  green: {
    fitted: "hsla(140, 70%, 55%, VAR)",
    ideal: "hsla(160, 80%, 65%, VAR)",
    line: "hsla(140, 50%, 45%, VAR)",
    rect: "hsla(140, 30%, 35%, VAR)",
    construction: "hsla(140, 20%, 35%, VAR)",
  },
  white: {
    fitted: "hsla(0, 0%, 90%, VAR)",
    ideal: "hsla(0, 0%, 100%, VAR)",
    line: "hsla(0, 0%, 80%, VAR)",
    rect: "hsla(0, 0%, 70%, VAR)",
    construction: "hsla(0, 0%, 60%, VAR)",
  },
  orange: {
    fitted: "hsla(30, 90%, 55%, VAR)",
    ideal: "hsla(40, 95%, 65%, VAR)",
    line: "hsla(30, 70%, 45%, VAR)",
    rect: "hsla(30, 50%, 35%, VAR)",
    construction: "hsla(30, 40%, 35%, VAR)",
  },
};

function getColor(colorKey: string, type: keyof typeof GRID_COLORS.cyan, opacity: number): string {
  const palette = GRID_COLORS[colorKey] || GRID_COLORS.cyan;
  return palette[type].replace("VAR", (opacity / 100).toFixed(2));
}

export function LogoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = useLogoStore.getState();
    const { imageElement, warpedImageData, gridData, settings, animationProgress, isProcessing } = state;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    if (!imageElement) return;

    const padding = 60;
    const availW = w - padding * 2;
    const availH = h - padding * 2;
    const imgAspect = imageElement.width / imageElement.height;
    const availAspect = availW / availH;

    let drawW: number, drawH: number;
    if (imgAspect > availAspect) {
      drawW = availW;
      drawH = availW / imgAspect;
    } else {
      drawH = availH;
      drawW = availH * imgAspect;
    }

    const drawX = (w - drawW) / 2 + settings.offsetX;
    const drawY = (h - drawH) / 2 + settings.offsetY;

    // Checkerboard
    const checkSize = 8;
    for (let cy = 0; cy < drawH; cy += checkSize) {
      for (let cx = 0; cx < drawW; cx += checkSize) {
        const isLight = (Math.floor(cx / checkSize) + Math.floor(cy / checkSize)) % 2 === 0;
        ctx.fillStyle = isLight ? "#2a2a2a" : "#222";
        ctx.fillRect(drawX + cx, drawY + cy, Math.min(checkSize, drawW - cx), Math.min(checkSize, drawH - cy));
      }
    }

    // Draw logo (warped or original)
    if (settings.showWarped && warpedImageData && settings.warpStrength > 0) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = warpedImageData.width;
      tempCanvas.height = warpedImageData.height;
      tempCanvas.getContext("2d")!.putImageData(warpedImageData, 0, 0);
      ctx.drawImage(tempCanvas, drawX, drawY, drawW, drawH);
    } else {
      ctx.drawImage(imageElement, drawX, drawY, drawW, drawH);
    }

    // Grid overlay
    if (gridData && animationProgress > 0) {
      const scaleX = drawW / imageElement.width;
      const scaleY = drawH / imageElement.height;
      const scaleF = settings.scale / 100;
      const progress = Math.min(1, animationProgress);

      const centerX = drawX + drawW / 2;
      const centerY = drawY + drawH / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scaleF, scaleF);
      ctx.translate(-centerX, -centerY);

      // Fitted circles (trace actual curves)
      if (settings.fittedCircles) {
        drawFittedCircles(ctx, gridData.fittedCircles, drawX, drawY, scaleX, scaleY, settings, progress);
      }

      // Ideal circles (Fibonacci-snapped)
      if (settings.idealCircles) {
        drawIdealCircles(ctx, gridData.idealCircles, drawX, drawY, scaleX, scaleY, settings, progress);
      }

      // Construction lines between circle centers
      if (settings.constructionLines) {
        drawLines(ctx, gridData.constructionLines, drawX, drawY, scaleX, scaleY, settings, progress, "construction");
      }

      // Rectangles
      if (settings.goldenRect) {
        drawRects(ctx, gridData.goldenRects, drawX, drawY, scaleX, scaleY, settings, progress);
      }

      // Lines
      if (settings.ruleOfThirds) {
        drawLines(ctx, gridData.thirdLines, drawX, drawY, scaleX, scaleY, settings, progress, "line");
      }
      if (settings.diagonals) {
        drawLines(ctx, gridData.diagonalLines, drawX, drawY, scaleX, scaleY, settings, progress, "line");
      }
      if (settings.baseline) {
        drawLines(ctx, gridData.baselineLines, drawX, drawY, scaleX, scaleY, settings, progress, "line");
      }
      if (settings.verticalRhythm) {
        drawLines(ctx, gridData.verticalLines, drawX, drawY, scaleX, scaleY, settings, progress, "line");
      }

      ctx.restore();
    }

    // Processing shimmer
    if (isProcessing) {
      const shimmerTime = (Date.now() % 2000) / 2000;
      const shimmerX = shimmerTime * w * 1.5 - w * 0.25;
      const grad = ctx.createLinearGradient(shimmerX - 100, 0, shimmerX + 100, 0);
      grad.addColorStop(0, "rgba(56, 189, 248, 0)");
      grad.addColorStop(0.5, "rgba(56, 189, 248, 0.08)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      draw();
      frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [draw]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

function drawFittedCircles(
  ctx: CanvasRenderingContext2D,
  circles: FittedCircle[],
  ox: number, oy: number, sx: number, sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number
) {
  const color = getColor(settings.gridColor, "fitted", settings.opacity);
  const scale = Math.min(sx, sy);

  circles.forEach((c, i) => {
    const delay = i / circles.length;
    const p = Math.max(0, Math.min(1, (progress - delay * 0.4) / 0.6));
    if (p <= 0) return;

    const cx = ox + c.cx * sx;
    const cy = oy + c.cy * sy;
    const r = c.r * scale;

    // Draw the full circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2 * p);
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth;
    ctx.stroke();

    // Highlight the arc segment that was actually traced
    if (p > 0.5 && c.arcPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ox + c.arcPoints[0].x * sx, oy + c.arcPoints[0].y * sy);
      const arcLen = Math.floor(c.arcPoints.length * Math.min(1, (p - 0.5) * 2));
      for (let j = 1; j < arcLen; j++) {
        ctx.lineTo(ox + c.arcPoints[j].x * sx, oy + c.arcPoints[j].y * sy);
      }
      ctx.strokeStyle = getColor(settings.gridColor, "fitted", Math.min(100, settings.opacity * 1.5));
      ctx.lineWidth = settings.strokeWidth * 2;
      ctx.stroke();
    }

    // Center dot
    if (p > 0.8) {
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  });
}

function drawIdealCircles(
  ctx: CanvasRenderingContext2D,
  circles: IdealCircle[],
  ox: number, oy: number, sx: number, sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number
) {
  const color = getColor(settings.gridColor, "ideal", settings.opacity * 0.7);
  const scale = Math.min(sx, sy);

  circles.forEach((c, i) => {
    const delay = i / circles.length;
    const p = Math.max(0, Math.min(1, (progress - delay * 0.4) / 0.6));
    if (p <= 0) return;

    const cx = ox + c.cx * sx;
    const cy = oy + c.cy * sy;
    const r = c.r * scale;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2 * p);
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth * 0.8;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label with Fibonacci number
    if (p > 0.9) {
      ctx.font = "10px monospace";
      ctx.fillStyle = color;
      ctx.fillText(`fib(${c.fibIndex})`, cx + r * 0.7 + 4, cy - 4);
    }
  });
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: GridLine[],
  ox: number, oy: number, sx: number, sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number,
  colorType: "line" | "construction"
) {
  const color = getColor(settings.gridColor, colorType, settings.opacity * (colorType === "construction" ? 0.6 : 1));

  lines.forEach((line, i) => {
    const delay = i / lines.length;
    const p = Math.max(0, Math.min(1, (progress - delay * 0.3) / 0.7));
    if (p <= 0) return;

    const x1 = ox + line.x1 * sx;
    const y1 = oy + line.y1 * sy;
    const x2 = ox + line.x2 * sx;
    const y2 = oy + line.y2 * sy;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth * (colorType === "construction" ? 0.5 : 0.8);
    ctx.setLineDash(colorType === "construction" ? [2, 4] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawRects(
  ctx: CanvasRenderingContext2D,
  rects: GridRect[],
  ox: number, oy: number, sx: number, sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number
) {
  const color = getColor(settings.gridColor, "rect", settings.opacity);

  rects.forEach((rect, i) => {
    const delay = i / rects.length;
    const p = Math.max(0, Math.min(1, (progress - delay * 0.3) / 0.7));
    if (p <= 0) return;

    const x = ox + rect.x * sx;
    const y = oy + rect.y * sy;
    const w = rect.width * sx * p;
    const h = rect.height * sy * p;

    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth * 0.6;
    ctx.strokeRect(x, y, w, h);
  });
}

export function getCanvasForExport(
  imageElement: HTMLImageElement,
  gridData: GridData,
  settings: ReturnType<typeof useLogoStore.getState>["settings"],
  mode: "combined" | "grid-only" | "logo-only" | "warped",
  scale: number = 2,
  warpedImageData?: ImageData | null
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = imageElement.width * scale;
  const h = imageElement.height * scale;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  if (mode === "warped" && warpedImageData) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = warpedImageData.width;
    tempCanvas.height = warpedImageData.height;
    tempCanvas.getContext("2d")!.putImageData(warpedImageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, w, h);
    return canvas;
  }

  if (mode !== "grid-only") {
    ctx.drawImage(imageElement, 0, 0, w, h);
  }

  if (mode !== "logo-only") {
    const sx = scale;
    const sy = scale;
    const scaleF = settings.scale / 100;
    const centerX = w / 2;
    const centerY = h / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scaleF, scaleF);
    ctx.translate(-centerX, -centerY);

    if (settings.fittedCircles) drawFittedCircles(ctx, gridData.fittedCircles, 0, 0, sx, sy, settings, 1);
    if (settings.idealCircles) drawIdealCircles(ctx, gridData.idealCircles, 0, 0, sx, sy, settings, 1);
    if (settings.constructionLines) drawLines(ctx, gridData.constructionLines, 0, 0, sx, sy, settings, 1, "construction");
    if (settings.goldenRect) drawRects(ctx, gridData.goldenRects, 0, 0, sx, sy, settings, 1);
    if (settings.ruleOfThirds) drawLines(ctx, gridData.thirdLines, 0, 0, sx, sy, settings, 1, "line");
    if (settings.diagonals) drawLines(ctx, gridData.diagonalLines, 0, 0, sx, sy, settings, 1, "line");
    if (settings.baseline) drawLines(ctx, gridData.baselineLines, 0, 0, sx, sy, settings, 1, "line");
    if (settings.verticalRhythm) drawLines(ctx, gridData.verticalLines, 0, 0, sx, sy, settings, 1, "line");

    ctx.restore();
  }

  return canvas;
}
