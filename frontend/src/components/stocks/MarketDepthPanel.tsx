import { formatPaise } from "@/lib/format";
import { FnoProvenance } from "@/components/trading/FnoQuoteDetails";
import type { DepthItem, Quote } from "@/types";

const count = (n?: number) =>
  Number.isSafeInteger(n) && n! >= 0 ? n!.toLocaleString("en-IN") : "—";
export default function MarketDepthPanel({
  quote,
  now,
  sessionLive,
}: {
  quote?: Quote;
  now: number;
  sessionLive: boolean;
}) {
  const valid = (row: DepthItem) =>
    Number.isSafeInteger(row.price_paise) &&
    row.price_paise > 0 &&
    Number.isSafeInteger(row.quantity) &&
    row.quantity > 0;
  const bids = (quote?.depth?.bids || [])
    .filter(valid)
    .sort((a, b) => b.price_paise - a.price_paise)
    .slice(0, 5);
  const asks = (quote?.depth?.asks || [])
    .filter(valid)
    .sort((a, b) => a.price_paise - b.price_paise)
    .slice(0, 5);
  const available =
    !!(bids.length || asks.length) &&
    !(bids.length && asks.length && bids[0].price_paise > asks[0].price_paise);
  const buy = bids.reduce((sum, row) => sum + row.quantity, 0),
    sell = asks.reduce((sum, row) => sum + row.quantity, 0);
  return (
    <section
      aria-label="Market depth"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-[#ffffff] p-4 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Market depth</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Up to 5 levels · L2 book
        </span>
      </div>
      <div className="mt-2">
        <FnoProvenance quote={quote} now={now} sessionLive={sessionLive} />
      </div>
      {available ? (
        <>
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Provider bid and ask book"
          >
            <table className="w-full min-w-[290px] text-right text-[11px] tabular-nums">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  {["Orders", "Qty", "Bid", "Ask", "Qty", "Orders"].map(
                    (label, i) => (
                      <th
                        key={i}
                        className={`py-2 font-medium ${i < 3 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: Math.max(bids.length, asks.length) },
                  (_, i) => (
                    <tr
                      key={i}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="bg-emerald-50/70 py-2 dark:bg-emerald-950/30">
                        {count(bids[i]?.orders)}
                      </td>
                      <td className="bg-emerald-50/70 dark:bg-emerald-950/30">
                        {count(bids[i]?.quantity)}
                      </td>
                      <td className="bg-emerald-50/70 pr-2 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                        {bids[i] ? formatPaise(bids[i].price_paise) : "—"}
                      </td>
                      <td className="bg-rose-50/70 pl-2 font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                        {asks[i] ? formatPaise(asks[i].price_paise) : "—"}
                      </td>
                      <td className="bg-rose-50/70 dark:bg-rose-950/30">
                        {count(asks[i]?.quantity)}
                      </td>
                      <td className="bg-rose-50/70 dark:bg-rose-950/30">
                        {count(asks[i]?.orders)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <span className="text-emerald-700 dark:text-emerald-400">
              Displayed bid qty {count(buy)}
            </span>
            <span className="text-rose-700 dark:text-rose-400">
              Displayed ask qty {count(sell)}
            </span>
          </div>
          {bids.length > 0 && asks.length > 0 && (
            <div
              className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-rose-400"
              aria-label={`Displayed bid share ${((buy / (buy + sell)) * 100).toFixed(1)} percent`}
            >
              <div
                className="bg-emerald-500"
                style={{ width: `${(buy / (buy + sell)) * 100}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {bids.length} bid / {asks.length} ask levels supplied. Missing
            levels and order counts are shown as —.
          </p>
        </>
      ) : (
        <p
          role="status"
          className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-950 dark:text-slate-400"
        >
          Depth is not available in the latest Angel One snapshot. The order
          book appears when the provider supplies it.
        </p>
      )}
      {(quote?.total_buy_quantity !== undefined ||
        quote?.total_sell_quantity !== undefined) && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Exchange total buy {count(quote.total_buy_quantity)} · sell{" "}
          {count(quote.total_sell_quantity)}
        </p>
      )}
    </section>
  );
}
