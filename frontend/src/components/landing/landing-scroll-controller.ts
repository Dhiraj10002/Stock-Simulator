import { landingChapterOffset, landingScrollFrame } from "@/lib/landingScroll";

const COLORS = ["#22d3ee", "#c084fc", "#34d399", "#fbbf24", "#38bdf8"];
const STEP_TITLES = ["YOUR VIRTUAL WALLET", "YOUR FIRST PAPER ORDER", "YOUR NEXT LESSON"];
const PRODUCT_NOTES: Record<string, string> = {
  delivery: "Understand holdings and full upfront funding.",
  intraday: "Explore simulator margin and intraday session restrictions.",
  derivatives: "Review expiry, contract lot size and total quantity.",
};
const AI: Record<string, { question: string; answer: string }> = {
  risk: { question: "How should I think about risk?", answer: "Start with position sizing. How much of your virtual portfolio is in one trade?" },
  orders: { question: "How does a limit order work?", answer: "A market order aims to execute at an available price. A limit order sets a price, but a fill is not guaranteed." },
  review: { question: "What should I review after a trade?", answer: "Write down why you entered the trade and what made you exit. Review the decision, as well as the result." },
};
const STORIES = [
  { label: "ILLUSTRATIVE LEARNER STORY", quote: "I wanted a place to understand orders before putting my savings at risk.", role: "First-time market learner", subtitle: "Learning the basics, one paper trade at a time", avatar: "FL", goal: "Make the first step feel clearer.", path: ["Find a stock", "Place a paper order", "Review your result"] },
  { label: "ILLUSTRATIVE STRATEGY STORY", quote: "I wanted to practise contract sizing and margin before putting real money on the line.", role: "Strategy explorer", subtitle: "Testing ideas and refining a trading process", avatar: "SE", goal: "Give your process a practice run.", path: ["Explore a contract", "Check required funds", "Review your process"] },
  { label: "ILLUSTRATIVE EDUCATOR STORY", quote: "I wanted students to explore market concepts through examples they could try themselves.", role: "Market educator", subtitle: "Bringing market concepts into the classroom", avatar: "ME", goal: "Make a concept feel tangible.", path: ["Explain an order", "Explore the portfolio", "Discuss the outcome"] },
];

// Owns only static server-rendered children. Scroll frames update CSS variables;
// chapter boundaries update attributes/content. No React renders or API requests.
export function mountLandingScroll(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const sections = all("[data-scroll-scenes]");
  // Use one desktop/tablet breakpoint; viewport height must not disable chapters.
  const media = matchMedia("(min-width:768px) and (prefers-reduced-motion:no-preference)");
  const reduced = matchMedia("(prefers-reduced-motion:reduce)");
  const current = new Map<HTMLElement, number>();
  const visible = new Set<HTMLElement>();
  const animations = new Map<HTMLElement, Animation>();
  const touchAbort = new AbortController();
  let frame = 0, offset = 96;
  let gesture: { x: number; y: number; section: HTMLElement } | null = null;

  const text = (selector: string, value: string) => { const node = $(selector); if (node) node.textContent = value; };
  const animate = (node: HTMLElement | null) => {
    if (!node?.animate || reduced.matches || document.hidden) return;
    animations.get(node)?.cancel();
    animations.set(node, node.animate([{ opacity: 0.6, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 240, easing: "ease-out" }));
  };
  const selectButton = (buttons: HTMLElement[], index: number, tabs = false) => buttons.forEach((button, i) => {
    const active = i === index;
    button.classList.toggle("active", active);
    button.setAttribute(tabs ? "aria-selected" : "aria-pressed", String(active));
    if (tabs) button.tabIndex = active ? 0 : -1;
  });
  const show = (section: HTMLElement, index: number, initial = false) => {
    if (!initial && current.get(section) === index) return;
    current.set(section, index);
    if (section.id === "how") {
      selectButton(all("[data-step]"), index, true);
      all(".how-panel").forEach((panel, i) => { panel.hidden = i !== index; });
      const window = $(".step-window");
      if (window) window.dataset.stage = String(index);
      text("#step-title", STEP_TITLES[index]);
      text("#step-count", `0${index + 1} / 03 · ILLUSTRATIVE EXAMPLE`);
      text("#next-step", index === 2 ? "Start again ↺" : "Next step →");
      if (!initial) animate($(`#step-panel-${index}`));
    } else if (section.id === "features") {
      selectButton(all("[data-feature]"), index, true);
      all(".scroll-feature-panel").forEach((panel, i) => { panel.hidden = i !== index; });
      section.style.setProperty("--scene-color", COLORS[index]);
      $(".feature-stage")?.style.setProperty("--scene-color", COLORS[index]);
      if (!initial) animate($(`#feature-panel-${index}`));
    } else {
      selectButton(all("[data-story]"), index);
      const story = STORIES[index];
      text("#story-kicker", story.label); text("#story-quote", story.quote);
      text("#story-role", story.role); text("#story-subtitle", story.subtitle); text("#story-avatar", story.avatar); text("#story-goal", story.goal);
      const path = $("#story-path");
      if (path) {
        path.replaceChildren(...story.path.map((label, i) => {
          const row = document.createElement("div"), number = document.createElement("span");
          number.textContent = `0${i + 1}`; row.append(number, document.createTextNode(label)); return row;
        }));
      }
      if (!initial) animate($(".story-content"));
    }
    const count = Number(section.dataset.scrollScenes);
    const counter = section.querySelector<HTMLElement>(".scene-count");
    if (counter) counter.textContent = `0${index + 1} / 0${count}`;
    if (!media.matches) section.style.setProperty("--scene-progress", String((index + 1) / count));
  };

  const measureOffset = () => {
    const header = document.querySelector<HTMLElement>("[data-landing-header]");
    const ticker = document.querySelector<HTMLElement>("[data-landing-ticker]");
    offset = Math.max(0, header?.getBoundingClientRect().bottom ?? 58, ticker?.getBoundingClientRect().bottom ?? 96);
    root.style.setProperty("--scroll-top", `${offset}px`);
  };
  const update = () => {
    frame = 0;
    if (document.hidden || !media.matches) return;
    // Read all geometry before changing attributes/styles to avoid repeated layout.
    const bounds = sections.filter(section => visible.has(section)).map(section => ({
      section, rect: section.getBoundingClientRect(), pinnedHeight: section.querySelector<HTMLElement>(".scroll-pin")?.offsetHeight ?? 0,
    }));
    for (const { section, rect, pinnedHeight } of bounds) {
      if (rect.bottom < offset || rect.top > innerHeight) continue;
      const { index, progress } = landingScrollFrame(rect.top, rect.height, pinnedHeight, offset, Number(section.dataset.scrollScenes));
      show(section, index);
      section.style.setProperty("--scene-progress", String(progress));
      section.style.setProperty("--scene-rx", `${((1 - progress) * 4).toFixed(2)}deg`);
      section.style.setProperty("--scene-ry", `${((1 - progress) * -5).toFixed(2)}deg`);
      section.style.setProperty("--scene-scale", (0.98 + progress * 0.02).toFixed(4));
    }
  };
  const requestUpdate = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(update); };
  const navigate = (section: HTMLElement, index: number) => {
    if (!media.matches) { show(section, index); return; }
    const pinnedHeight = section.querySelector<HTMLElement>(".scroll-pin")?.offsetHeight ?? 0;
    const top = section.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: top + landingChapterOffset(index, Number(section.dataset.scrollScenes), section.offsetHeight - pinnedHeight), behavior: "smooth" });
  };
  const choose = (button: HTMLElement) => {
    const section = button.closest<HTMLElement>("[data-scroll-scenes]");
    if (!section) return;
    if (button.dataset.step !== undefined) navigate(section, Number(button.dataset.step));
    else if (button.dataset.feature !== undefined) navigate(section, Number(button.dataset.feature));
    else if (button.dataset.story) navigate(section, all("[data-story]").indexOf(button));
    else if (button.id === "next-step") navigate(section, ((current.get(section) ?? 0) + 1) % 3);
    else if (button.dataset.product) {
      selectButton(all("[data-product]"), all("[data-product]").indexOf(button));
      text("#product-note", PRODUCT_NOTES[button.dataset.product]);
    } else if (button.dataset.ai) {
      selectButton(all("[data-ai]"), all("[data-ai]").indexOf(button));
      text("#ai-question", AI[button.dataset.ai].question); text("#ai-answer", AI[button.dataset.ai].answer);
    } else if (button.dataset.watch) {
      const saved = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(saved)); button.classList.toggle("saved", saved); button.textContent = saved ? "★" : "☆";
      button.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${button.dataset.watch} ${saved ? "from" : "to"} preview watchlist`);
    } else if (button.id === "demo-order") {
      const input = $<HTMLInputElement>("#demo-quantity");
      const n = input ? Number(input.value) : 0;
      if (Number.isInteger(n) && n >= 1 && n <= 1000) text("#order-result", `Previewed ${n} share${n === 1 ? "" : "s"} for ${money(n * 1226.4)}. No order was sent.`);
    }
  };
  const click = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
    if (button && root.contains(button)) choose(button);
  };
  const keydown = (event: KeyboardEvent) => {
    const button = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-step],[data-feature],[data-story]") : null;
    if (!button) return;
    const section = button.closest<HTMLElement>("[data-scroll-scenes]");
    if (!section) return;
    const buttons = [...section.querySelectorAll<HTMLElement>("[data-step],[data-feature],[data-story]")];
    const i = buttons.indexOf(button), count = buttons.length;
    let next: number;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (i + 1) % count;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (i + count - 1) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;
    event.preventDefault(); buttons[next].focus(); navigate(section, next);
  };
  const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const input = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.id !== "demo-quantity") return;
    const n = Number(event.target.value), valid = Number.isInteger(n) && n >= 1 && n <= 1000;
    text("#demo-funds", valid ? money(n * 1226.4) : "Enter 1–1,000");
    const button = $<HTMLButtonElement>("#demo-order"); if (button) button.disabled = !valid;
    text("#order-result", "Interactive example only. No order is submitted.");
  };
  const touchstart = (event: TouchEvent) => {
    gesture = null;
    if (media.matches || event.touches.length !== 1 || !(event.target instanceof Element) || event.target.closest("button,input,a")) return;
    const section = event.target.closest<HTMLElement>("[data-scroll-scenes]");
    if (section && event.target.closest(".feature-stage,.story-shell,.step-window")) gesture = { section, x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const touchend = (event: TouchEvent) => {
    if (!gesture || !event.changedTouches[0]) return;
    const { section, x, y } = gesture, point = event.changedTouches[0]; gesture = null;
    const dx = point.clientX - x, dy = point.clientY - y, count = Number(section.dataset.scrollScenes);
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(section, ((current.get(section) ?? 0) + (dx < 0 ? 1 : count - 1)) % count);
  };
  const refresh = () => {
    measureOffset();
    sections.forEach(section => {
      const index = current.get(section) ?? 0;
      section.style.setProperty("--scene-progress", String((index + 1) / Number(section.dataset.scrollScenes)));
      for (const prop of ["--scene-rx", "--scene-ry", "--scene-scale"]) section.style.removeProperty(prop);
    });
    if (reduced.matches) animations.forEach(animation => animation.cancel());
    requestUpdate();
  };
  const visibility = () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; animations.forEach(animation => animation.cancel()); }
    else requestUpdate();
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) visible.add(entry.target as HTMLElement); else visible.delete(entry.target as HTMLElement); });
    requestUpdate();
  }, { rootMargin: "200px 0px" });
  sections.forEach(section => { section.style.setProperty("--chapters", section.dataset.scrollScenes!); observer.observe(section); show(section, 0, true); });
  all("[data-feature]").forEach((tab, i) => tab.style.setProperty("--scene-color", COLORS[i]));
  all(".tiny-bars i").forEach(bar => bar.style.setProperty("--bar-height", bar.style.height));
  root.classList.add("scroll-enhanced"); measureOffset();
  // Observe pin heights too: font readiness and responsive content can change travel.
  const resize = new ResizeObserver(requestUpdate);
  all(".scroll-pin").forEach(pin => resize.observe(pin));
  root.addEventListener("click", click); root.addEventListener("keydown", keydown); root.addEventListener("input", input);
  root.addEventListener("touchstart", touchstart, { passive: true }); root.addEventListener("touchend", touchend, { passive: true }); root.addEventListener("touchcancel", () => { gesture = null; }, { signal: touchAbort.signal });
  window.addEventListener("scroll", requestUpdate, { passive: true }); window.addEventListener("resize", refresh, { passive: true });
  document.addEventListener("visibilitychange", visibility); media.addEventListener("change", refresh); reduced.addEventListener("change", refresh);
  requestUpdate();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); animations.forEach(animation => animation.cancel()); touchAbort.abort();
    root.removeEventListener("click", click); root.removeEventListener("keydown", keydown); root.removeEventListener("input", input);
    root.removeEventListener("touchstart", touchstart); root.removeEventListener("touchend", touchend);
    window.removeEventListener("scroll", requestUpdate); window.removeEventListener("resize", refresh); document.removeEventListener("visibilitychange", visibility);
    media.removeEventListener("change", refresh); reduced.removeEventListener("change", refresh); root.classList.remove("scroll-enhanced");
  };
}
