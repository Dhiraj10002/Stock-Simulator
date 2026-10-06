"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const SpatialCanvas = dynamic(() => import("./SpatialCanvas"), { ssr: false });
const AuthModal = dynamic(() => import("@/components/auth/AuthModal"), { ssr: false });

// Static sections are passed from the server. Pointer and scroll updates touch
// only CSS variables/attributes, without rendering the landing page again.
export default function LandingExperience({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visualsReady, setVisualsReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const router = useRouter();

  useEffect(() => {
    const idle = window.requestIdleCallback?.(() => setVisualsReady(true), { timeout: 1500 });
    const timer = idle === undefined ? window.setTimeout(() => setVisualsReady(true), 750) : undefined;
    const openAuth = (event: Event) => {
      const mode = (event as CustomEvent).detail;
      if (mode === "login" || mode === "register") setAuthMode(mode);
    };
    window.addEventListener("landing-auth", openAuth);
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("landing-auth", openAuth);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    const links = [...root.querySelectorAll<HTMLElement>("[data-landing-nav]")];
    const sections = links.map(link => document.getElementById(link.dataset.landingNav!)).filter((section): section is HTMLElement => !!section);
    const deck = root.querySelector<HTMLElement>("[data-platform-deck]");
    let pointerFrame = 0, scrollFrame = 0, lastCard: HTMLElement | null = null;
    let pointerX = 0, pointerY = 0, hoveredCard: HTMLElement | null = null;

    const resetCard = (card: HTMLElement | null) => {
      for (const key of ["--tilt-x", "--tilt-y", "--glare-opacity"]) card?.style.removeProperty(key);
    };
    const updatePointer = () => {
      pointerFrame = 0;
      if (document.hidden || motion.matches || !finePointer.matches) return;
      const x = (pointerX / innerWidth - 0.5) * 2, y = (pointerY / innerHeight - 0.5) * 2;
      root.style.setProperty("--pointer-x", String(x));
      root.style.setProperty("--pointer-y", String(y));
      root.dataset.pointerX = String(x);
      root.dataset.pointerY = String(y);
      if (lastCard !== hoveredCard) resetCard(lastCard);
      lastCard = hoveredCard;
      if (!hoveredCard) return;
      const rect = hoveredCard.getBoundingClientRect();
      const cx = (pointerX - rect.left) / rect.width, cy = (pointerY - rect.top) / rect.height;
      hoveredCard.style.setProperty("--tilt-x", `${(cy - 0.5) * -12}deg`);
      hoveredCard.style.setProperty("--tilt-y", `${(cx - 0.5) * 12}deg`);
      hoveredCard.style.setProperty("--glare-x", `${cx * 100}%`);
      hoveredCard.style.setProperty("--glare-y", `${cy * 100}%`);
      hoveredCard.style.setProperty("--glare-opacity", "0.28");
    };
    const pointerMove = (event: PointerEvent) => {
      if (motion.matches || !finePointer.matches) return;
      pointerX = event.clientX; pointerY = event.clientY;
      hoveredCard = (event.target as Element).closest<HTMLElement>("[data-tilt-card]");
      if (!pointerFrame) pointerFrame = requestAnimationFrame(updatePointer);
    };
    const pointerLeave = () => {
      cancelAnimationFrame(pointerFrame); pointerFrame = 0;
      resetCard(lastCard); lastCard = hoveredCard = null;
      root.style.removeProperty("--pointer-x"); root.style.removeProperty("--pointer-y");
      root.dataset.pointerX = root.dataset.pointerY = "0";
    };
    const updateScroll = () => {
      scrollFrame = 0;
      if (document.hidden) return;
      const active = [...sections].reverse().find(section => section.offsetTop <= scrollY + 180)?.id || "hero";
      for (const link of links) {
        if (link.dataset.landingNav === active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
      if (deck && !motion.matches && finePointer.matches) {
        const rect = deck.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < innerHeight) {
          const progress = Math.max(0, Math.min(1, 1 - (rect.top - innerHeight * 0.1) / (innerHeight * 0.7)));
          deck.style.setProperty("--deck-x", `${(1 - progress) * 4}deg`);
          deck.style.setProperty("--deck-y", `${(1 - progress) * 10}px`);
        }
      }
    };
    const scroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); };
    const visibility = () => {
      root.dataset.pageHidden = String(document.hidden);
      if (document.hidden) { cancelAnimationFrame(pointerFrame); cancelAnimationFrame(scrollFrame); pointerFrame = scrollFrame = 0; }
      else scroll();
    };
    const preference = () => { pointerLeave(); scroll(); };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) (entry.target as HTMLElement).dataset.inView = String(entry.isIntersecting);
    });
    for (const section of sections) observer.observe(section);
    root.addEventListener("pointermove", pointerMove, { passive: true });
    root.addEventListener("pointerleave", pointerLeave);
    window.addEventListener("scroll", scroll, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", preference);
    finePointer.addEventListener("change", preference);
    scroll();
    return () => {
      cancelAnimationFrame(pointerFrame); cancelAnimationFrame(scrollFrame); observer.disconnect();
      root.removeEventListener("pointermove", pointerMove); root.removeEventListener("pointerleave", pointerLeave);
      window.removeEventListener("scroll", scroll); document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", preference); finePointer.removeEventListener("change", preference);
    };
  }, []);

  return <div ref={rootRef} className="dark landing-experience relative min-h-screen text-slate-100 font-sans overflow-x-hidden selection:bg-blue-600/30 selection:text-white" data-landing style={{ backgroundColor: "#04060b" }}>
    <a href="#hero" className="sr-only focus:not-sr-only focus:fixed focus:z-[60] focus:bg-slate-900 focus:p-3">Skip to content</a>
    <svg aria-hidden className="landing-stars fixed inset-0 z-0 h-full w-full pointer-events-none" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 90 }, (_, i) => <circle key={i} cx={(i * 137.508) % 1440} cy={(i * 97.3) % 900} r={0.65 + (i % 3) * 0.4} fill={["#06b6d4", "#f97316", "#10b981", "#fbbf24", "#a855f7", "#f472b6"][i % 6]} opacity={0.2 + (i % 5) * 0.12} />)}
    </svg>
    {visualsReady && <SpatialCanvas />}
    {children}
    {authMode && <AuthModal isOpen mode={authMode} onClose={() => setAuthMode(null)} onSuccess={() => {
      window.dispatchEvent(new Event("auth-changed"));
      setAuthMode(null); router.push("/dashboard");
    }} />}
  </div>;
}
