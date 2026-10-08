"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthToken } from "@/hooks/useAuthToken";
import { getAuthToken } from "@/lib/api";

export function useRequireAuth(redirectPath?: string) {
  const token = useAuthToken();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!getAuthToken()) {
      const target = redirectPath || pathname || "/dashboard";
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
    }
  }, [token, router, pathname, redirectPath]);

  return token;
}
