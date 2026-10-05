"use client";

import Link from "next/link";
import { useAuthToken } from "@/hooks/useAuthToken";

export default function HomeActions({ compact = false }: { compact?: boolean }) {
  const token = useAuthToken();
  if (compact) {
    return <Link prefetch={false} href={token ? "/dashboard" : "/login"} className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{token ? "Dashboard" : "Log in"}</Link>;
  }
  return <Link prefetch={false} href={token ? "/dashboard" : "/signup"} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-cyan-800 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-cyan-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-800">Start paper trading <span aria-hidden>→</span></Link>;
}
