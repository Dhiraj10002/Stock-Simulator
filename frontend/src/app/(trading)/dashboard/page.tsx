"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthToken } from "@/hooks/useAuthToken";
import { getAuthToken } from "@/lib/api";
import DashboardPage from "@/components/dashboard/DashboardPage";
export default function DashboardRoute() {
  const token = useAuthToken();
  const router = useRouter();
  useEffect(() => { if (!getAuthToken()) router.replace("/login?redirect=/dashboard"); }, [token, router]);
  return token ? <DashboardPage /> : <main className="mx-auto max-w-xl p-8"><p>Sign in to view your practice account.</p><Link href="/login?redirect=/dashboard" className="mt-4 inline-block text-cyan-700 underline">Log in</Link></main>;
}
