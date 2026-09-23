"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/config";
import { useTerminalStore } from "@/stores/terminal-store";
import {
  Newspaper,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Clock,
  Filter,
} from "lucide-react";
import type { Article, ApiResponse } from "@/types";

interface NewsFeedProps {
  token?: string;
  apiUrl?: string;
  limit?: number;
}

const FALLBACK_ARTICLES: Article[] = [
  {
    title: "Nifty 50 approaches record high led by banking and auto heavyweights",
    url: "#",
    source: "LiveMint",
    published_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    sentiment: "POSITIVE",
    score: 0.85,
    symbols: ["NIFTY 50", "HDFCBANK", "TATAMOTORS"],
  },
  {
    title: "Reliance Retail expands footprint with 150 new tech-driven fulfillment hubs",
    url: "#",
    source: "Economic Times",
    published_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    sentiment: "POSITIVE",
    score: 0.78,
    symbols: ["RELIANCE"],
  },
  {
    title: "IT sector faces margin headwinds ahead of Q3 earnings reports; select stocks slip",
    url: "#",
    source: "CNBC TV18",
    published_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    sentiment: "NEGATIVE",
    score: -0.62,
    symbols: ["TCS", "INFY", "WIPRO"],
  },
  {
    title: "RBI maintains repo rate at 6.5%, highlights resilient domestic macroeconomic outlook",
    url: "#",
    source: "Moneycontrol",
    published_at: new Date(Date.now() - 1000 * 60 * 160).toISOString(),
    sentiment: "NEUTRAL",
    score: 0.1,
    symbols: ["BANKNIFTY", "SBIN", "ICICIBANK"],
  },
  {
    title: "Tata Steel records robust European operational volumes, steel prices stabilize",
    url: "#",
    source: "Business Standard",
    published_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    sentiment: "POSITIVE",
    score: 0.72,
    symbols: ["TATASTEEL"],
  },
];

export default function NewsFeed({
  token,
  apiUrl = getApiUrl(),
  limit = 20,
}: NewsFeedProps) {
  const router = useRouter();
  const setSelectedSymbol = useTerminalStore((s) => s.setSelectedSymbol);
  const [filter, setFilter] = useState<"ALL" | "POSITIVE" | "NEGATIVE" | "NEUTRAL">("ALL");

  const { data: articles = [], isLoading } = useQuery<Article[]>({
    queryKey: ["news", limit],
    queryFn: async () => {
      try {
        const res = await fetch(`${apiUrl}/news?limit=${limit}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return FALLBACK_ARTICLES;
        const json: ApiResponse<Article[]> = await res.json();
        if (json.data && json.data.length > 0) {
          return json.data;
        }
        return FALLBACK_ARTICLES;
      } catch {
        return FALLBACK_ARTICLES;
      }
    },
    refetchInterval: 30000,
  });

  const filteredArticles = useMemo(() => {
    if (filter === "ALL") return articles;
    return articles.filter((a) => a.sentiment === filter);
  }, [articles, filter]);

  const handleSymbolClick = (e: React.MouseEvent, sym: string) => {
    e.stopPropagation();
    setSelectedSymbol(sym);
    router.push(`/stocks/${encodeURIComponent(sym)}`);
  };

  const [currentTime] = useState(() => Date.now());

  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = currentTime - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return "Recent";
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg">
      {/* Feed Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-slate-100">Market Intelligence & News</h3>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 text-[11px]">
          {(["ALL", "POSITIVE", "NEGATIVE", "NEUTRAL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                filter === f
                  ? "bg-slate-700 text-cyan-400 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Stream */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-2">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Streaming financial headlines…</span>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <Filter className="w-6 h-6 text-slate-700 mx-auto mb-2 stroke-[1.5]" />
            <span>No articles found for selected filter.</span>
          </div>
        ) : (
          filteredArticles.map((art, idx) => {
            const isPos = art.sentiment === "POSITIVE";
            const isNeg = art.sentiment === "NEGATIVE";

            return (
              <div
                key={idx}
                className="p-3 hover:bg-slate-800/40 rounded-lg transition-colors group flex flex-col gap-1.5"
              >
                {/* Meta Row: Sentiment badge, Source, Time */}
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-bold uppercase ${
                        isPos
                          ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/40"
                          : isNeg
                          ? "bg-rose-950/80 text-rose-400 border border-rose-800/40"
                          : "bg-slate-800 text-slate-300 border border-slate-700/50"
                      }`}
                    >
                      {isPos && <TrendingUp className="w-2.5 h-2.5" />}
                      {isNeg && <TrendingDown className="w-2.5 h-2.5" />}
                      {art.sentiment}
                    </span>
                    <span className="font-semibold text-slate-400">{art.source}</span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimeAgo(art.published_at)}</span>
                  </div>
                </div>

                {/* Title */}
                <a
                  href={art.url !== "#" ? art.url : undefined}
                  target={art.url !== "#" ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors line-clamp-2 leading-relaxed"
                >
                  {art.title}
                  {art.url !== "#" && (
                    <ExternalLink className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </a>

                {/* Attached Symbol Badges */}
                {art.symbols && art.symbols.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {art.symbols.map((s) => (
                      <button
                        key={s}
                        onClick={(e) => handleSymbolClick(e, s)}
                        className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800/70 hover:bg-cyan-500/20 hover:text-cyan-300 text-slate-400 border border-slate-700/50 transition-colors"
                        title={`Trade ${s}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
