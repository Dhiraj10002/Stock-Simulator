"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthModal from "@/components/auth/AuthModal";
import { useAuthToken } from "@/hooks/useAuthToken";

function LoginCardFallback() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#04060b] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#090d16]/90 border border-slate-800 p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-mono">
            <span>STOCKSIM AUTHENTICATION</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to your account</h1>
          <p className="text-xs text-slate-400">Continue paper trading equities and derivatives</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="h-3.5 w-16 bg-slate-800 rounded" />
            <div className="h-11 w-full bg-slate-900 border border-slate-800 rounded-xl" />
          </div>
          <div className="space-y-1">
            <div className="h-3.5 w-16 bg-slate-800 rounded" />
            <div className="h-11 w-full bg-slate-900 border border-slate-800 rounded-xl" />
          </div>
          <div className="h-11 w-full bg-cyan-600 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md shadow-cyan-600/20">
            Sign In
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/dashboard";
  const token = useAuthToken();

  useEffect(() => {
    if (token) {
      router.replace(redirectUrl);
    }
  }, [token, router, redirectUrl]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#04060b] flex items-center justify-center">
      <AuthModal
        isOpen={true}
        mode="login"
        onClose={() => router.push("/")}
        onSuccess={() => router.push(redirectUrl)}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCardFallback />}>
      <LoginContent />
    </Suspense>
  );
}
