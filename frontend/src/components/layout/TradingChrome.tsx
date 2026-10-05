"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import MobileBottomNav from "./MobileBottomNav";
import { useUIStore } from "@/stores/ui-store";
const SearchModal = dynamic(() => import("./SearchModal"), { ssr: false });
const ShortcutsModal = dynamic(() => import("./ShortcutsModal"), { ssr: false });

export default function TradingChrome({ children }: { children: React.ReactNode }) {
  const searchOpen = useUIStore(s => s.isSearchPaletteOpen);
  const [searchLoaded, setSearchLoaded] = useState(false);
  useEffect(() => { if (searchOpen) queueMicrotask(() => setSearchLoaded(true)); }, [searchOpen]);
  const shortcutsOpen = useUIStore(s => s.isShortcutsGuideOpen);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useUIStore.getState().setSearchPaletteOpen(!useUIStore.getState().isSearchPaletteOpen);
      } else if (event.key === "?" && !target?.matches("input, textarea, select, [contenteditable=true]")) {
        event.preventDefault();
        useUIStore.getState().setShortcutsGuideOpen(!useUIStore.getState().isShortcutsGuideOpen);
      } else if (event.key === "Escape") {
        useUIStore.getState().setSearchPaletteOpen(false);
        useUIStore.getState().setShortcutsGuideOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  return <div className="min-h-screen pb-20 md:pb-0">{children}{(searchOpen || searchLoaded) && <SearchModal />}{shortcutsOpen && <ShortcutsModal />}<MobileBottomNav /></div>;
}
