"use client";

import React, { useState, useEffect } from "react";
import DashboardPage from "@/components/dashboard/DashboardPage";
import AuthModal from "@/components/auth/AuthModal";

export default function ExploreRoutePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const token =
        localStorage.getItem("auth_token") ||
        localStorage.getItem("stock-simulator-access-token");
      setIsAuthenticated(!!token);
    });
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("stock-simulator-access-token");
    localStorage.removeItem("stock-simulator-refresh-token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    window.location.href = "/";
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00d09c] to-[#00b386] animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <DashboardPage onSignOut={handleSignOut} />
      {!isAuthenticated && (
        <AuthModal
          isOpen={authModalOpen}
          mode="login"
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            setAuthModalOpen(false);
            setIsAuthenticated(true);
          }}
        />
      )}
    </>
  );
}
