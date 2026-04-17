"use client";

import { useLogoStore, type ActiveTab } from "@/lib/use-logo-store";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GridPanel } from "./panels/grid-panel";
import { DeviationPanel } from "./panels/deviation-panel";
import { TweakedPanel } from "./panels/tweaked-panel";

export function ModeTabs() {
  const { activeTab, setActiveTab } = useLogoStore();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as ActiveTab)}
      className="w-full h-full flex flex-col gap-0"
    >
      <div className="px-3 pt-3 pb-2 border-b border-neutral-800 bg-[#141414]">
        <TabsList className="w-full bg-neutral-900 h-9 grid grid-cols-3 gap-1 p-1 rounded-lg">
          <TabsTrigger
            value="grid"
            className="text-sm font-medium data-active:bg-neutral-800 data-active:text-neutral-100 text-neutral-300 focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Grid overlay mode"
          >
            Grid
          </TabsTrigger>
          <TabsTrigger
            value="deviation"
            className="text-sm font-medium data-active:bg-neutral-800 data-active:text-neutral-100 text-neutral-300 focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Deviation analysis mode"
          >
            Deviations
          </TabsTrigger>
          <TabsTrigger
            value="tweaked"
            className="text-sm font-medium data-active:bg-neutral-800 data-active:text-neutral-100 text-neutral-300 focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Tweaked logo mode"
          >
            Tweaked
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="grid" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <GridPanel />
        </ScrollArea>
      </TabsContent>
      <TabsContent value="deviation" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <DeviationPanel />
        </ScrollArea>
      </TabsContent>
      <TabsContent value="tweaked" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <TweakedPanel />
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
