/** Map native document scroll to a bounded chapter without intercepting scrolling. */
export function landingScrollFrame(top: number, height: number, pinnedHeight: number, offset: number, count: number) {
  const travel = Math.max(0, height - pinnedHeight);
  const progress = travel > 0 ? Math.min(1, Math.max(0, (offset - top) / travel)) : 0;
  return { progress, index: Math.min(Math.max(0, count - 1), Math.floor(progress * count)) };
}

export function landingChapterOffset(index: number, count: number, travel: number) {
  const bounded = Math.min(Math.max(0, count - 1), Math.max(0, index));
  const progress = bounded === 0 ? 0 : bounded === count - 1 ? 1 : (bounded + 0.5) / count;
  return Math.max(0, travel) * progress;
}
