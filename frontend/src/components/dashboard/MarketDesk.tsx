"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { publicFetch } from "@/lib/api";
import type { Article } from "@/types";

type Calendar = {year: number; available: boolean; exchange: string; source_url: string; version: string; holidays: {date: string; occasion: string; session_status: string}[]};

export default function MarketDesk() {
  const [tab, setTab] = useState<"news" | "ipos" | "holidays">("news");
  const news = useQuery({queryKey: ["dashboard-news"], queryFn: () => publicFetch<Article[]>("/news?limit=5"), refetchInterval: 30000});
  const status = useQuery({queryKey: ["news-ingestion-status"], queryFn: () => publicFetch<{status: string}>("/news/status"), refetchInterval: 30000});
  const calendar = useQuery({queryKey: ["exchange-calendar"], queryFn: () => publicFetch<Calendar>("/market/calendar"), staleTime: 3600000});

  return <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
    <div className="flex gap-3 border-b border-slate-200 dark:border-slate-800 p-3">
      {(["news", "ipos", "holidays"] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`text-xs font-bold px-2 py-1 ${tab === t ? "text-cyan-600" : "text-slate-500"}`}>
        {t === "news" ? "Market News" : t === "ipos" ? "IPOs" : "Holiday Calendar"}
      </button>)}
    </div>
    <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto text-xs">
      {tab === "ipos" && <p className="text-slate-500">IPO data unavailable. A verified primary-market feed has not been connected.</p>}
      {tab === "news" && <>
        <p className="text-slate-500">News feed: {status.isError ? "unavailable" : status.data?.status ?? "checking"}</p>
        {news.isError && <p role="alert">News could not be refreshed. Retained articles may be outdated.</p>}
        {news.isPending && <p>Loading news…</p>}
        {news.data?.length === 0 && <p>No sourced articles available.</p>}
        {news.data?.map((a, i) => <article key={`${a.url}-${i}`} className="border-b border-slate-100 dark:border-slate-800 pb-3">
          {/^https?:\/\//i.test(a.url) ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-cyan-600">{a.title}</a> : <p className="font-semibold">{a.title}</p>}
          <p className="mt-1 text-slate-500">{a.source} · {Number.isFinite(Date.parse(a.published_at)) ? new Date(a.published_at).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"}) + " IST" : "Publication time unavailable"}</p>
        </article>)}
        <Link href="/news" className="text-cyan-600 font-semibold">Open news desk →</Link>
      </>}
      {tab === "holidays" && <>
        {calendar.isError && <p role="alert">Calendar unavailable.</p>}
        {calendar.isPending && <p>Loading calendar…</p>}
        {calendar.data && <>
          <p className="text-slate-500">{calendar.data.exchange} · {calendar.data.year}</p>
          {!calendar.data.available ? <p>Verified calendar unavailable for this year. Trading is disabled until a sourced calendar is installed.</p> : <>
            <a href={calendar.data.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan-600">Exchange notice · {calendar.data.version}</a>
            {calendar.data.holidays.map(h => <div key={h.date} className="border-b border-slate-100 dark:border-slate-800 pb-2">
              <p className="font-semibold">{h.occasion}</p><p className="text-slate-500">{h.date} · {h.session_status === "SPECIAL_TIMES_UNCONFIRMED" ? "Special session announced; times unconfirmed. Trading disabled." : "Regular session closed"}</p>
            </div>)}
          </>}
        </>}
      </>}
    </div>
  </div>;
}
