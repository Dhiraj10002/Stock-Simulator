"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { tradingPanel } from "./tradingStyles";
const query = "(max-width: 1023px)";
const subscribe = (callback: () => void) => { const media = window.matchMedia(query); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };

export default function ResponsiveOrderPanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const mobile = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobile || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') || [])].filter(element => element.getClientRects().length > 0);
    focusables()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const elements = focusables(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [mobile, open, onClose]);
  return <>
    {open && <button aria-label="Dismiss order ticket" onClick={onClose} className="fixed inset-0 z-50 bg-slate-950/60 lg:hidden" tabIndex={-1} />}
    <section id="stock-order" ref={ref} role={mobile && open ? "dialog" : "region"} aria-modal={mobile && open ? true : undefined} aria-label="Paper order ticket" className={`${tradingPanel} ${open ? "block" : "hidden"} fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))] lg:static lg:z-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-b-2xl lg:pb-5`}>
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 lg:hidden dark:border-slate-800"><span className="text-sm font-bold">Paper order ticket</span><button aria-label="Close order ticket" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><X aria-hidden className="h-5 w-5" /></button></div>
      {children}
    </section>
  </>;
}
