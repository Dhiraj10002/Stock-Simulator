// Timings and redacted paths only: never cookies, response bodies or query strings.
export function reportPath(url) {
  return new URL(url).pathname.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, ":id");
}

export function summarizeTimings(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { samples: 0, p50Ms: null, p95Ms: null };
  const percentile = p => Math.round(sorted[Math.ceil(sorted.length * p) - 1] * 100) / 100;
  return { samples: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
}

export function accountObservation(requests, seconds, authenticated) {
  const account = requests.filter(item => /^\/api\/backend\/(wallet|portfolio|orders|trades)(?:\/|$)/.test(item.path));
  const eligible = authenticated && seconds > 0;
  return {
    status: eligible ? "measured" : "not_measured",
    reason: !authenticated ? "No verified authenticated session" : seconds <= 0 ? "No observation window requested" : null,
    authenticated, seconds,
    count: eligible ? account.length : null,
    requestsPerMinute: eligible ? Math.round(account.length * 60 / seconds * 100) / 100 : null,
    requests: account,
    byPath: eligible ? Object.fromEntries([...new Set(account.map(item => item.path))].sort().map(path => [path, account.filter(item => item.path === path).length])) : {},
  };
}
