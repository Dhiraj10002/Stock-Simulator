"use client";

import React, { useState, useEffect } from "react";
import LandingPage from "@/components/landing/LandingPage";
import DashboardPage from "@/components/dashboard/DashboardPage";
import AuthModal from "@/components/auth/AuthModal";

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => {
    queueMicrotask(() => {
      const token =
        localStorage.getItem("auth_token") ||
        localStorage.getItem("stock-simulator-access-token");
      setIsAuthenticated(!!token);
    });
  }, []);

  const handleOpenAuth = (mode: "login" | "register" = "login") => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleSignOut = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("stock-simulator-access-token");
    localStorage.removeItem("stock-simulator-refresh-token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    setIsAuthenticated(false);
  };

  const handleAuthSuccess = () => {
    setAuthModalOpen(false);
    setIsAuthenticated(true);
  };

  // Initial loading state — prevent flash
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00d09c] to-[#00b386] animate-pulse" />
      </div>
    );
  }

  // Authenticated → Groww-style User Explore Dashboard
  if (isAuthenticated) {
    return <DashboardPage onSignOut={handleSignOut} />;
  }

  // Unauthenticated → 3D Spatial Landing Page with Auth Modal
  return (
    <>
      <LandingPage onOpenAuth={handleOpenAuth} />
      <AuthModal
        isOpen={authModalOpen}
        mode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
