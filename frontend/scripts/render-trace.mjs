// Timeline categories omit network request bodies/headers and screenshots.
export async function startRenderTrace(cdp) {
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline",
    transferMode: "ReturnAsStream",
  });
}
export async function stopRenderTrace(cdp) {
  const completed = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  const { stream } = await completed;
  let raw = "";
  try {
    for (;;) {
      const part = await cdp.send("IO.read", { handle: stream });
      raw += part.base64Encoded ? Buffer.from(part.data, "base64").toString("utf8") : part.data;
      if (part.eof) break;
      if (raw.length > 50_000_000) throw new Error("Trace exceeds 50 MB; capture a shorter interval");
    }
  } finally { await cdp.send("IO.close", { handle: stream }); }
  const trace = JSON.parse(raw), totals = new Map();
  for (const e of trace.traceEvents || []) {
    if (e.ph !== "X" || !Number.isFinite(e.dur) || !["Layout", "Paint", "PrePaint", "UpdateLayoutTree", "RasterTask", "RunTask", "FunctionCall"].includes(e.name)) continue;
    const prev = totals.get(e.name) || { name: e.name, count: 0, totalMs: 0, maxMs: 0 };
    prev.count++; prev.totalMs += e.dur / 1000; prev.maxMs = Math.max(prev.maxMs, e.dur / 1000); totals.set(e.name, prev);
  }
  return { raw, summary: [...totals.values()].sort((a, b) => b.totalMs - a.totalMs) };
}
