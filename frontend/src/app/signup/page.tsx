"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthModal from "@/components/auth/AuthModal";
import { useAuthToken } from "@/hooks/useAuthToken";

function SignUpContent() {
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
        mode="register"
        onClose={() => router.push("/")}
        onSuccess={() => router.push(redirectUrl)}
      />
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-[#04060b]" />}>
      <SignUpContent />
    </Suspense>
  );
}
