"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { publicFetch } from "@/lib/api";
import type { Article } from "@/types";

type Calendar = {
  year: number;
  available: boolean;
  exchange: string;
  source_url: string;
  version: string;
  holidays: { date: string; occasion: string; session_status: string }[];
};

export default function MarketDesk() {
  const [tab, setTab] = useState<"news" | "holidays">("news");
  const [showPastHolidays, setShowPastHolidays] = useState(false);
  const news = useQuery({
    queryKey: ["dashboard-news"],
    queryFn: () => publicFetch<Article[]>("/news?limit=5"),
    enabled: tab === "news",
    refetchInterval: 30000,
  });
  const status = useQuery({
    queryKey: ["news-ingestion-status"],
    queryFn: () => publicFetch<{ status: string }>("/news/status"),
    enabled: tab === "news",
    refetchInterval: 30000,
  });
  const calendar = useQuery({
    queryKey: ["exchange-calendar"],
    queryFn: () => publicFetch<Calendar>("/market/calendar"),
    enabled: tab === "holidays",
    staleTime: 3600000,
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const holidays = (calendar.data?.holidays ?? []).filter(
    (h) => showPastHolidays || h.date >= today,
  );

  return (
    <section
      aria-label="Market desk"
      className="lg:col-span-5 self-start min-w-0 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden"
    >
      <div className="flex gap-3 border-b border-slate-200 dark:border-slate-800 p-3">
        {(["news", "holidays"] as const).map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`text-xs font-bold px-2 py-1 rounded-lg ${tab === t ? "text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/50" : "text-slate-500"}`}
          >
            {t === "news"
              ? "Market News"
              : "Holiday Calendar"}
          </button>
        ))}
      </div>
      <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto text-xs">
        {tab === "news" && (
          <>
            <p className="text-slate-500">
              News feed:{" "}
              {status.isError
                ? "unavailable"
                : (status.data?.status ?? "checking")}
            </p>
            {news.isError && (
              <p role="alert">
                News could not be refreshed. Retained articles may be outdated.
              </p>
            )}
            {news.isPending && <p>Loading news…</p>}
            {news.data?.length === 0 && <p>No sourced articles available.</p>}
            {news.data?.map((a, i) => (
              <article
                key={`${a.url}-${i}`}
                className="border-b border-slate-100 dark:border-slate-800 pb-3"
              >
                {/^https?:\/\//i.test(a.url) ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:text-cyan-600"
                  >
                    {a.title}
                  </a>
                ) : (
                  <p className="font-semibold">{a.title}</p>
                )}
                <p className="mt-1 text-slate-500">
                  {a.source} ·{" "}
                  {Number.isFinite(Date.parse(a.published_at))
                    ? new Date(a.published_at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      }) + " IST"
                    : "Publication time unavailable"}
                </p>
              </article>
            ))}
            <Link href="/news" className="text-cyan-600 font-semibold">
              Open news desk →
            </Link>
          </>
        )}
        {tab === "holidays" && (
          <>
            {calendar.isError && <p role="alert">Calendar unavailable.</p>}
            {calendar.isPending && <p>Loading calendar…</p>}
            {calendar.data && (
              <>
                <p className="text-slate-500">
                  {calendar.data.exchange} · {calendar.data.year}
                </p>
                {!calendar.data.available ? (
                  <p>
                    Verified calendar unavailable for this year. Trading is
                    disabled until a sourced calendar is installed.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={calendar.data.source_url}
                        title={calendar.data.version}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-700 dark:text-cyan-300"
                      >
                        Official exchange calendar ↗
                      </a>
                      <button
                        aria-pressed={showPastHolidays}
                        onClick={() => setShowPastHolidays(!showPastHolidays)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 font-semibold text-slate-600 dark:text-slate-300"
                      >
                        {showPastHolidays
                          ? "Upcoming holidays"
                          : "Show full year"}
                      </button>
                    </div>
                    {holidays.length === 0 && (
                      <p className="text-slate-500">
                        No upcoming holidays in this published calendar.
                      </p>
                    )}
                    {holidays.map((h) => (
                      <div
                        key={h.date}
                        className="flex items-start gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3"
                      >
                        <time
                          dateTime={h.date}
                          className="shrink-0 w-12 rounded-lg bg-slate-50 dark:bg-slate-800 p-1.5 text-center text-cyan-800 dark:text-cyan-300"
                        >
                          <span className="block text-lg font-black leading-tight">
                            {h.date.slice(8)}
                          </span>
                          <span className="text-[10px] uppercase font-semibold">
                            {new Date(
                              h.date + "T12:00:00+05:30",
                            ).toLocaleDateString("en-IN", {
                              month: "short",
                              timeZone: "Asia/Kolkata",
                            })}
                          </span>
                        </time>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {h.occasion}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {h.session_status === "SPECIAL_TIMES_UNCONFIRMED"
                              ? "Special session announced; times unconfirmed. Trading disabled."
                              : "Regular session closed"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
