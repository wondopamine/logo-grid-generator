"use client";

import { useRef, useEffect, useCallback } from "react";
import { useLogoStore } from "@/lib/use-logo-store";
import type { GridData, Circle, GridLine, GridRect } from "@/lib/grid-generator";

const GRID_COLORS: Record<string, { circle: string; line: string; rect: string }> = {
  cyan: {
    circle: "hsla(180, 80%, 60%, VAR)",
    line: "hsla(180, 60%, 50%, VAR)",
    rect: "hsla(180, 40%, 40%, VAR)",
  },
  green: {
    circle: "hsla(140, 70%, 55%, VAR)",
    line: "hsla(140, 50%, 45%, VAR)",
    rect: "hsla(140, 30%, 35%, VAR)",
  },
  white: {
    circle: "hsla(0, 0%, 90%, VAR)",
    line: "hsla(0, 0%, 80%, VAR)",
    rect: "hsla(0, 0%, 70%, VAR)",
  },
  orange: {
    circle: "hsla(30, 90%, 55%, VAR)",
    line: "hsla(30, 70%, 45%, VAR)",
    rect: "hsla(30, 50%, 35%, VAR)",
  },
};

function getColor(colorKey: string, type: "circle" | "line" | "rect", opacity: number): string {
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

    // Read directly from store to avoid stale closures
    const state = useLogoStore.getState();
    const { imageElement, gridData, settings, animationProgress, isProcessing } = state;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    if (!imageElement) return;

    // Calculate image positioning (fit with padding)
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

    // Checkerboard for transparency
    const checkSize = 8;
    for (let cy = 0; cy < drawH; cy += checkSize) {
      for (let cx = 0; cx < drawW; cx += checkSize) {
        const isLight = (Math.floor(cx / checkSize) + Math.floor(cy / checkSize)) % 2 === 0;
        ctx.fillStyle = isLight ? "#2a2a2a" : "#222";
        ctx.fillRect(
          drawX + cx,
          drawY + cy,
          Math.min(checkSize, drawW - cx),
          Math.min(checkSize, drawH - cy)
        );
      }
    }

    // Draw logo
    ctx.drawImage(imageElement, drawX, drawY, drawW, drawH);

    // Draw grid overlay
    if (gridData && animationProgress > 0) {
      const scaleX = drawW / imageElement.width;
      const scaleY = drawH / imageElement.height;
      const scaleF = settings.scale / 100;

      ctx.save();

      const progress = Math.min(1, animationProgress);

      // Transform for grid scaling
      const centerX = drawX + drawW / 2;
      const centerY = drawY + drawH / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(scaleF, scaleF);
      ctx.translate(-centerX, -centerY);

      // Draw circles
      if (settings.goldenCircles) {
        drawCircles(ctx, gridData.goldenCircles, drawX, drawY, scaleX, scaleY, settings, progress, "circle");
      }
      if (settings.concentricCircles) {
        drawCircles(ctx, gridData.concentricCircles, drawX, drawY, scaleX, scaleY, settings, progress, "circle");
      }
      if (settings.tangentCircles) {
        drawCircles(ctx, gridData.tangentCircles, drawX, drawY, scaleX, scaleY, settings, progress, "circle");
      }

      // Draw rectangles
      if (settings.goldenRect) {
        drawRects(ctx, gridData.goldenRects, drawX, drawY, scaleX, scaleY, settings, progress);
      }

      // Draw lines
      if (settings.ruleOfThirds) {
        drawLines(ctx, gridData.thirdLines, drawX, drawY, scaleX, scaleY, settings, progress);
      }
      if (settings.diagonals) {
        drawLines(ctx, gridData.diagonalLines, drawX, drawY, scaleX, scaleY, settings, progress);
      }
      if (settings.baseline) {
        drawLines(ctx, gridData.baselineLines, drawX, drawY, scaleX, scaleY, settings, progress);
      }
      if (settings.verticalRhythm) {
        drawLines(ctx, gridData.verticalLines, drawX, drawY, scaleX, scaleY, settings, progress);
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

function drawCircles(
  ctx: CanvasRenderingContext2D,
  circles: Circle[],
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number,
  _type: "circle"
) {
  const color = getColor(settings.gridColor, "circle", settings.opacity);

  circles.forEach((c, i) => {
    const delay = i / circles.length;
    const circleProgress = Math.max(0, Math.min(1, (progress - delay * 0.5) / 0.5));
    if (circleProgress <= 0) return;

    ctx.beginPath();
    const cx = ox + c.cx * sx;
    const cy = oy + c.cy * sy;
    const r = c.r * Math.min(sx, sy) * circleProgress;

    ctx.arc(cx, cy, r, 0, Math.PI * 2 * circleProgress);
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth;
    ctx.stroke();

    // Draw center dot
    if (circleProgress > 0.8) {
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  });
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: GridLine[],
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number
) {
  const color = getColor(settings.gridColor, "line", settings.opacity);

  lines.forEach((line, i) => {
    const delay = i / lines.length;
    const lineProgress = Math.max(0, Math.min(1, (progress - delay * 0.3) / 0.7));
    if (lineProgress <= 0) return;

    const x1 = ox + line.x1 * sx;
    const y1 = oy + line.y1 * sy;
    const x2 = ox + line.x2 * sx;
    const y2 = oy + line.y2 * sy;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (x2 - x1) * lineProgress, y1 + (y2 - y1) * lineProgress);
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth * 0.8;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawRects(
  ctx: CanvasRenderingContext2D,
  rects: GridRect[],
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  settings: { opacity: number; strokeWidth: number; gridColor: string },
  progress: number
) {
  const color = getColor(settings.gridColor, "rect", settings.opacity);

  rects.forEach((rect, i) => {
    const delay = i / rects.length;
    const rectProgress = Math.max(0, Math.min(1, (progress - delay * 0.3) / 0.7));
    if (rectProgress <= 0) return;

    const x = ox + rect.x * sx;
    const y = oy + rect.y * sy;
    const w = rect.width * sx * rectProgress;
    const h = rect.height * sy * rectProgress;

    ctx.strokeStyle = color;
    ctx.lineWidth = settings.strokeWidth * 0.6;
    ctx.strokeRect(x, y, w, h);
  });
}

export function getCanvasForExport(
  imageElement: HTMLImageElement,
  gridData: GridData,
  settings: ReturnType<typeof useLogoStore.getState>["settings"],
  mode: "combined" | "grid-only" | "logo-only",
  scale: number = 2
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = imageElement.width * scale;
  const h = imageElement.height * scale;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

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

    if (settings.goldenCircles) drawCircles(ctx, gridData.goldenCircles, 0, 0, sx, sy, settings, 1, "circle");
    if (settings.concentricCircles) drawCircles(ctx, gridData.concentricCircles, 0, 0, sx, sy, settings, 1, "circle");
    if (settings.tangentCircles) drawCircles(ctx, gridData.tangentCircles, 0, 0, sx, sy, settings, 1, "circle");
    if (settings.goldenRect) drawRects(ctx, gridData.goldenRects, 0, 0, sx, sy, settings, 1);
    if (settings.ruleOfThirds) drawLines(ctx, gridData.thirdLines, 0, 0, sx, sy, settings, 1);
    if (settings.diagonals) drawLines(ctx, gridData.diagonalLines, 0, 0, sx, sy, settings, 1);
    if (settings.baseline) drawLines(ctx, gridData.baselineLines, 0, 0, sx, sy, settings, 1);
    if (settings.verticalRhythm) drawLines(ctx, gridData.verticalLines, 0, 0, sx, sy, settings, 1);

    ctx.restore();
  }

  return canvas;
}
