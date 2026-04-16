"use client";

import { Toolbar } from "@/components/toolbar";
import { LogoCanvas } from "@/components/logo-canvas";
import { UploadZone } from "@/components/upload-zone";
import { GridSidebar } from "@/components/grid-sidebar";
import { AnalysisCard } from "@/components/analysis-card";
import { useLogoStore } from "@/lib/use-logo-store";

export default function Home() {
  const imageUrl = useLogoStore((s) => s.imageUrl);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative bg-[#1a1a1a]">
          <LogoCanvas />
          <UploadZone />
        </div>
        {imageUrl && <GridSidebar />}
      </div>
      <AnalysisCard />
    </div>
  );
}
