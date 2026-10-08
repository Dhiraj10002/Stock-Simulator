"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthModal from "@/components/auth/AuthModal";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/dashboard";

  return (
    <div className="min-h-screen bg-[#04060b] flex items-center justify-center">
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
    <Suspense fallback={<div className="min-h-screen bg-[#04060b]" />}>
      <LoginContent />
    </Suspense>
  );
}
