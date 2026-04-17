"use client";

import { useLogoStore } from "@/lib/use-logo-store";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Draggable vertical divider that sits on top of the canvas in Tweaked mode.
 * The canvas draws original on the left, tweaked on the right, clipped at compareSplitX.
 * This component renders just the handle + line.
 */
export function CompareSlider({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { compareSplitX, setCompareSplitX, tweakedGenerated } = useLogoStore();
  const [dragging, setDragging] = useState(false);
  const handleRef = useRef<HTMLButtonElement>(null);

  const positionToSplit = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      setCompareSplitX(x);
    },
    [containerRef, setCompareSplitX]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      positionToSplit(clientX);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, positionToSplit]);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCompareSplitX(compareSplitX - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCompareSplitX(compareSplitX + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        setCompareSplitX(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setCompareSplitX(1);
      }
    },
    [compareSplitX, setCompareSplitX]
  );

  if (!tweakedGenerated) return null;

  const leftPercent = compareSplitX * 100;

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden={false}>
      {/* Vertical divider line */}
      <div
        className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.5)] pointer-events-none"
        style={{ left: `${leftPercent}%`, transform: "translateX(-1px)" }}
      />

      {/* Labels */}
      <div
        className="absolute top-4 pointer-events-none"
        style={{ left: `calc(${leftPercent}% - 88px)` }}
      >
        <span className="px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-xs text-white font-medium">
          Original
        </span>
      </div>
      <div
        className="absolute top-4 pointer-events-none"
        style={{ left: `calc(${leftPercent}% + 12px)` }}
      >
        <span className="px-2 py-1 rounded-md bg-cyan-500/90 backdrop-blur-sm text-xs text-neutral-950 font-semibold">
          Tweaked
        </span>
      </div>

      {/* Drag handle */}
      <button
        ref={handleRef}
        type="button"
        role="slider"
        aria-label="Compare original and tweaked logo — drag horizontally or use arrow keys"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(compareSplitX * 100)}
        aria-valuetext={`${Math.round(compareSplitX * 100)} percent`}
        onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
        onTouchStart={() => setDragging(true)}
        onKeyDown={onKey}
        className="absolute top-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg flex items-center justify-center cursor-ew-resize pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a]"
        style={{ left: `${leftPercent}%` }}
      >
        <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h8m-8-4h8m-8 8h8" />
        </svg>
      </button>
    </div>
  );
}
