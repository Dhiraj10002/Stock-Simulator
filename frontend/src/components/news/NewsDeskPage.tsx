"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Search,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info,
  X,
  Activity,
  Terminal,
  ChevronRight,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { publicFetch } from "@/lib/api";
import type { Article } from "@/types";

const TRENDING_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "RELIANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "TATAMOTORS",
  "ZOMATO",
  "TATASTEEL",
];

const SECTORS = [
  "ALL",
  "BANKING",
  "IT",
  "ENERGY",
  "AUTO",
  "MACRO",
  "METALS",
  "PHARMA",
];

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return "Just now";
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "Recent";
  }
}

export default function NewsDeskPage() {
  const [sentimentFilter, setSentimentFilter] = useState<"ALL" | "POSITIVE" | "NEGATIVE" | "NEUTRAL">("ALL");
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Fetch News from Backend Go API
  const {
    data: articles = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Article[]>({
    queryKey: ["news-desk", selectedSymbol],
    queryFn: () => {
      const param = selectedSymbol ? `?symbol=${encodeURIComponent(selectedSymbol)}&limit=50` : `?limit=50`;
      return publicFetch<Article[]>(`/news${param}`);
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Calculate Sentiment Barometer Statistics
  const stats = useMemo(() => {
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    let totalScore = 0;

    articles.forEach((a) => {
      if (a.sentiment === "POSITIVE") positive++;
      else if (a.sentiment === "NEGATIVE") negative++;
      else neutral++;
      totalScore += a.score || 0;
    });

    const total = articles.length || 1;
    const posPct = Math.round((positive / total) * 100);
    const negPct = Math.round((negative / total) * 100);
    const neuPct = Math.max(0, 100 - posPct - negPct);
    const avgScore = (totalScore / total).toFixed(1);

    return {
      total: articles.length,
      positive,
      negative,
      neutral,
      posPct,
      negPct,
      neuPct,
      avgScore,
      bias:
        positive > negative
          ? "BULLISH BIAS"
          : negative > positive
          ? "BEARISH BIAS"
          : "BALANCED / NEUTRAL",
    };
  }, [articles]);

  // Client-side Filtered Articles
  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      // 1. Sentiment filter
      if (sentimentFilter !== "ALL" && a.sentiment !== sentimentFilter) {
        return false;
      }

      // 2. Sector filter
      if (selectedSector !== "ALL") {
        const hasSector = a.sectors && a.sectors.includes(selectedSector);
        if (!hasSector) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = a.title.toLowerCase().includes(q);
        const matchesSource = a.source.toLowerCase().includes(q);
        const matchesSymbol =
          a.symbols && a.symbols.some((s) => s.toLowerCase().includes(q));
        if (!matchesTitle && !matchesSource && !matchesSymbol) {
          return false;
        }
      }

      return true;
    });
  }, [articles, sentimentFilter, selectedSector, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ------------------------------------------------------------------ */}
        {/* 1. HEADER & LIVE FEED STATUS */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
                Live News Ingestion
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Lexical Sentiment Classifier
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              Indian Financial News Desk
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Real-time aggregation from verified Indian financial press feeds, transparent lexical scoring, and continuous stock ticker symbol mapping.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading || isRefetching}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-cyan-400 ${
                  isRefetching ? "animate-spin" : ""
                }`}
              />
              <span>Refresh Feed</span>
            </button>

            <Link
              href="/terminal"
              className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-600/20"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Launch Terminal</span>
            </Link>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 2. MARKET SENTIMENT BAROMETER */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Aggregate Market Sentiment */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
              <span>Overall Sentiment</span>
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <div
                className={`text-lg font-extrabold font-mono flex items-center gap-1.5 ${
                  stats.bias === "BULLISH BIAS"
                    ? "text-emerald-400"
                    : stats.bias === "BEARISH BIAS"
                    ? "text-rose-400"
                    : "text-slate-300"
                }`}
              >
                {stats.bias === "BULLISH BIAS" && (
                  <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                )}
                {stats.bias === "BEARISH BIAS" && (
                  <ArrowDownRight className="w-5 h-5 text-rose-400" />
                )}
                <span>{stats.bias}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Net Score: {stats.avgScore} across {stats.total} headlines
              </p>
            </div>
          </div>

          {/* Card 2: Bullish Articles */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" /> Positive / Bullish
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {stats.posPct}%
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-white mb-2">
              {stats.positive}
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${stats.posPct}%` }}
              />
            </div>
          </div>

          {/* Card 3: Neutral Articles */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5" /> Neutral / Macro
              </span>
              <span className="font-mono font-bold text-slate-300">
                {stats.neuPct}%
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-white mb-2">
              {stats.neutral}
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-slate-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${stats.neuPct}%` }}
              />
            </div>
          </div>

          {/* Card 4: Bearish Articles */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-rose-400">
                <TrendingDown className="w-3.5 h-3.5" /> Negative / Bearish
              </span>
              <span className="font-mono font-bold text-rose-400">
                {stats.negPct}%
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-white mb-2">
              {stats.negative}
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-rose-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${stats.negPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 3. FILTERS, SEARCH & TRENDING TICKERS */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          {/* Top Row: Search & Sentiment Filter Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search headlines, companies, publishers, or symbols..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 transition-colors font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sentiment Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
              {(["ALL", "POSITIVE", "NEGATIVE", "NEUTRAL"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentimentFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    sentimentFilter === s
                      ? s === "POSITIVE"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : s === "NEGATIVE"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : "bg-slate-800 text-cyan-300 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s === "ALL" ? "All Sentiments" : s}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Row: Sector Filter & Trending Symbol Chips */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
            {/* Sector Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">
                Sector:
              </span>
              {SECTORS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setSelectedSector(sec)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    selectedSector === sec
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/80"
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>

            {/* Active Symbol Filter Chip (if selected) */}
            {selectedSymbol && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Filtering Symbol:</span>
                <span className="px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 font-mono font-bold text-xs border border-cyan-800 flex items-center gap-1.5">
                  {selectedSymbol}
                  <button
                    type="button"
                    onClick={() => setSelectedSymbol("")}
                    className="hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </div>
            )}
          </div>

          {/* Quick Trending Counters */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase shrink-0">
              Trending Counters:
            </span>
            {TRENDING_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedSymbol(selectedSymbol === sym ? "" : sym)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer shrink-0 ${
                  selectedSymbol === sym
                    ? "bg-cyan-500 text-slate-950 font-black"
                    : "bg-slate-950 text-slate-400 hover:text-cyan-300 border border-slate-800"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 4. NEWS ARTICLES FEED */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
            <span>
              Showing {filteredArticles.length} headline
              {filteredArticles.length !== 1 ? "s" : ""}
            </span>
            <span>Real-time polling: Every 10 min</span>
          </div>

          {filteredArticles.map((article, idx) => {
            const isPositive = article.sentiment === "POSITIVE";
            const isNegative = article.sentiment === "NEGATIVE";

            return (
              <div
                key={`${article.url}-${idx}`}
                className="p-4 sm:p-5 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all duration-200 group flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
              >
                <div className="flex-1 space-y-2 min-w-0">
                  {/* Top Metadata Row: Source & Timestamp */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50">
                      {article.source}
                    </span>

                    <span className="text-slate-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(article.published_at)}
                    </span>

                    {/* Sector Tag */}
                    {article.sectors && article.sectors.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono uppercase">
                        {article.sectors[0]}
                      </span>
                    )}
                  </div>

                  {/* Headline Title */}
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-cyan-300 transition-colors leading-snug">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1.5 hover:underline"
                    >
                      <span>{article.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 shrink-0 mt-1 opacity-70 group-hover:opacity-100" />
                    </a>
                  </h3>

                  {/* Stock Symbol Tags */}
                  {article.symbols && article.symbols.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Impacted:
                      </span>
                      {article.symbols.map((sym) => (
                        <div key={sym} className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedSymbol(sym)}
                            className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 text-[11px] font-mono font-bold transition-colors cursor-pointer"
                            title={`Filter news for ${sym}`}
                          >
                            {sym}
                          </button>

                          <Link
                            href={`/terminal?symbol=${encodeURIComponent(sym)}`}
                            className="p-1 rounded bg-slate-950 hover:bg-cyan-950 text-slate-400 hover:text-cyan-300 border border-slate-800 transition-colors text-[10px]"
                            title={`Trade ${sym} in Pro Terminal`}
                          >
                            <Terminal className="w-3 h-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Sentiment Badge & Lexical Score */}
                <div className="flex md:flex-col items-center md:items-end justify-between shrink-0 gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
                  <div
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border shadow-xs ${
                      isPositive
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/60"
                        : isNegative
                        ? "bg-rose-950/80 text-rose-400 border-rose-800/60"
                        : "bg-slate-900 text-slate-300 border-slate-700"
                    }`}
                  >
                    {isPositive && <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />}
                    {isNegative && <ArrowDownRight className="w-3.5 h-3.5 stroke-[2.5]" />}
                    <span>{article.sentiment}</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-black/30 opacity-80">
                      {article.score > 0 ? `+${article.score}` : article.score}
                    </span>
                  </div>

                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span>Read Source</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {filteredArticles.length === 0 && (
            <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-800/80 space-y-3">
              <Newspaper className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No articles matched</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No articles currently match your selected filters. Try resetting the sentiment, sector, or search query.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSentimentFilter("ALL");
                  setSelectedSector("ALL");
                  setSelectedSymbol("");
                  setSearchQuery("");
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 5. EDUCATIONAL & REGULATORY COMPLIANCE BANNER */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-start gap-3 text-xs text-slate-400">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p>
            <strong className="text-slate-300">Disclaimer:</strong> Headline sentiment is classified automatically via financial lexical heuristics for educational paper-trading simulations. These indicators are not curated financial advice, investment recommendations, or buy/sell signals. Always conduct independent fundamental and technical diligence.
          </p>
        </div>
      </main>
    </div>
  );
}
