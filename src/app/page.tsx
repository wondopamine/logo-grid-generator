"use client";

import { Toolbar } from "@/components/toolbar";
import { LogoCanvas } from "@/components/logo-canvas";
import { UploadZone } from "@/components/upload-zone";
import { ModeTabs } from "@/components/mode-tabs";
import { AnalysisDialog } from "@/components/analysis-dialog";
import { useLogoStore } from "@/lib/use-logo-store";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Home() {
  const imageUrl = useLogoStore((s) => s.imageUrl);

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
        <Toolbar />
        <div className="flex flex-1 min-h-0">
          <main className="flex-1 relative bg-[#1a1a1a]">
            <LogoCanvas />
            <UploadZone />
          </main>
          {imageUrl && (
            <aside className="w-[320px] bg-[#141414] border-l border-neutral-800 flex flex-col" aria-label="Grid controls">
              <ModeTabs />
            </aside>
          )}
        </div>
        <AnalysisDialog />
      </div>
    </TooltipProvider>
  );
}
