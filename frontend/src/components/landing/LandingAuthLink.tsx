"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useAuthToken } from "@/hooks/useAuthToken";
import { loadAuthModal } from "@/components/auth/loadAuthModal";

export default function LandingAuthLink({ mode, className, style, children }: {
  mode: "login" | "register";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const token = useAuthToken();
  const prepareAuth = () => {
    // Warm only on intent; module loading is cached/deduplicated by the runtime.
    // Keep the public homepage lazy and never start an authentication request.
    if (!token) void loadAuthModal().catch(() => {});
  };
  return <Link prefetch={false} href={token ? "/dashboard" : mode === "login" ? "/login" : "/signup"}
    className={className} style={style} onPointerEnter={prepareAuth} onFocus={prepareAuth} onPointerDown={prepareAuth} onClick={event => {
      if (token || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("landing-auth", { detail: mode }));
    }}>{children}</Link>;
}
