"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useAuthToken } from "@/hooks/useAuthToken";

export default function LandingAuthLink({ mode, className, style, children }: {
  mode: "login" | "register";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const token = useAuthToken();
  return <Link prefetch={false} href={token ? "/dashboard" : mode === "login" ? "/login" : "/signup"}
    className={className} style={style} onClick={event => {
      if (token || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("landing-auth", { detail: mode }));
    }}>{children}</Link>;
}
