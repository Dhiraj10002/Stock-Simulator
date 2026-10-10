// History reconciles streamed candles; it is never an execution price source.
export function historyPollingInterval(input: { healthyStream: boolean; closed: boolean; missing: boolean; error: boolean }): number {
  if (input.error || input.missing) return 30_000;
  if (input.closed) return 300_000;
  return input.healthyStream ? 120_000 : 30_000;
}
