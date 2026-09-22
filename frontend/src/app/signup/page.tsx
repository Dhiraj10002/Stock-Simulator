"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/auth/AuthModal";

export default function SignUpPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#04060b] flex items-center justify-center">
      <AuthModal
        isOpen={true}
        mode="register"
        onClose={() => router.push("/")}
        onSuccess={() => router.push("/")}
      />
    </div>
  );
}
