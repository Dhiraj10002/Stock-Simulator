import { readFileSync, writeFileSync } from "node:fs";
const [beforePath, afterPath, output] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));
if (before.conditions !== after.conditions || before.browser !== after.browser) throw new Error("Comparison conditions differ");
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const rows = ["no-preference", "reduce"].map(motion => {
  const prior = before.runs.filter(run => run.reducedMotion === motion);
  const next = after.runs.filter(run => run.reducedMotion === motion);
  return { motion, samples_per_build: next.length,
    before: { lcp_ms: median(prior.map(run => run.navigation.lcpMs)), cls: median(prior.map(run => run.navigation.cls)), script_seconds: median(prior.map(run => run.cpu.scriptSeconds)), task_seconds: median(prior.map(run => run.cpu.taskSeconds)) },
    after: { lcp_ms: median(next.map(run => run.navigation.lcpMs)), cls: median(next.map(run => run.navigation.cls)), script_seconds: median(next.map(run => run.cpu.scriptSeconds)), task_seconds: median(next.map(run => run.cpu.taskSeconds)) },
  };
});
const result = { note: "Controlled browser lab comparison, two cold runs per motion setting. CI runner variance applies. Not real-user p75 or field INP. Deployed profiles still describe the deployed release.", conditions: after.conditions, rows };
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
