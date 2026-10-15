type Position = { section: string; progress: number };
const STATE_KEY = "stocksimLandingPosition";

// Keep a semantic position: document pixels change when scroll chapters hydrate.
export function mountLandingNavigation(root: HTMLElement, sections: HTMLElement[], links: HTMLElement[], schedule: () => void) {
  const previousRestoration = history.scrollRestoration;
  const abort = new AbortController();
  const pathname = location.pathname;
  history.scrollRestoration = "manual";
  let restoring = true, disposed = false, restoreFrame = 0;
  let position: Position | null = null;
  let highlighted = "";
  const offset = () => Math.max(0,
    root.querySelector("[data-landing-header]")?.getBoundingClientRect().bottom ?? 58,
    root.querySelector("[data-landing-ticker]")?.getBoundingClientRect().bottom ?? 96);
  const bounds = (section: HTMLElement) => {
    const start = section.getBoundingClientRect().top + scrollY;
    const next = sections[sections.indexOf(section) + 1];
    const end = (next ?? root).getBoundingClientRect()[next ? "top" : "bottom"] + scrollY;
    return { start: start - offset(), travel: Math.max(0, end - start - (innerHeight - offset())) };
  };
  const highlight = (id: string) => {
    if (highlighted === id) return;
    highlighted = id;
    for (const link of links) {
      if (link.dataset.landingNav === id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };
  const persist = () => {
    if (restoring || !position || location.pathname !== pathname) return;
    // Preserve Next.js router state and any other history consumers.
    history.replaceState({ ...history.state, [STATE_KEY]: position }, "", `${location.pathname}${location.search}#${position.section}`);
  };
  const update = () => {
    if (restoring || location.pathname !== pathname) return;
    const section = [...sections].reverse().find(node => node.getBoundingClientRect().top <= offset() + 24) ?? sections[0];
    if (!section) return;
    const { start, travel } = bounds(section);
    position = { section: section.id, progress: travel > 0 ? Math.max(0, Math.min(1, (scrollY - start) / travel)) : 0 };
    highlight(section.id);
    // Passive scrolling replaces the current entry only at section boundaries.
    if (location.hash !== `#${section.id}`) persist();
  };
  const targetPosition = (): Position | null => {
    const section = sections.find(node => `#${node.id}` === location.hash);
    if (!section) return null;
    const saved = history.state?.[STATE_KEY];
    return { section: section.id, progress: saved?.section === section.id && Number.isFinite(saved.progress) ? Math.max(0, Math.min(1, saved.progress)) : 0 };
  };
  const restore = (target: Position | null) => {
    if (disposed || !restoring) return;
    cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => {
      if (disposed || !restoring) return;
      if (target) {
        const section = sections.find(node => node.id === target.section);
        if (section) {
          const { start, travel } = bounds(section);
          window.scrollTo({ top: Math.max(0, start + travel * target.progress), behavior: "instant" });
        }
      }
      restoring = false;
      root.dataset.navigationReady = "true";
      update(); schedule();
    });
  };
  const initialTarget = targetPosition();
  if (initialTarget) highlight(initialTarget.section);
  const loaded = document.readyState === "complete" ? Promise.resolve() : new Promise<void>(resolve => window.addEventListener("load", () => resolve(), { once: true, signal: abort.signal }));
  // Wait for SSR content, fonts and child effects to settle before using geometry.
  const ready = Promise.all([loaded, document.fonts.ready]);
  void ready.then(() => restore(initialTarget));
  const cancelRestore = () => { if (restoring) { restoring = false; root.dataset.navigationReady = "true"; cancelAnimationFrame(restoreFrame); schedule(); } };
  const keydown = (event: KeyboardEvent) => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) cancelRestore(); };
  const popstate = () => { restoring = true; restore(targetPosition()); };
  const pagehide = () => { update(); persist(); };
  const visibility = () => { if (document.hidden) pagehide(); };
  const pageshow = (event: PageTransitionEvent) => { if (event.persisted) { restoring = false; schedule(); } };
  window.addEventListener("scrollend", persist, { signal: abort.signal });
  window.addEventListener("pagehide", pagehide, { signal: abort.signal });
  window.addEventListener("pageshow", pageshow, { signal: abort.signal });
  window.addEventListener("popstate", popstate, { signal: abort.signal });
  window.addEventListener("wheel", cancelRestore, { passive: true, signal: abort.signal });
  window.addEventListener("touchstart", cancelRestore, { passive: true, signal: abort.signal });
  window.addEventListener("keydown", keydown, { signal: abort.signal });
  document.addEventListener("visibilitychange", visibility, { signal: abort.signal });
  return { update, dispose: () => {
    pagehide(); disposed = true; abort.abort(); cancelAnimationFrame(restoreFrame);
    delete root.dataset.navigationReady;
    history.scrollRestoration = previousRestoration;
  } };
}
