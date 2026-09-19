"use client";

import React, { useState, useEffect } from "react";
import LandingPage from "@/components/landing/LandingPage";
import DashboardPage from "@/components/dashboard/DashboardPage";

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    setIsAuthenticated(!!token);
  }, []);

  // Initial loading state — prevent flash
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#060910] flex items-center justify-center">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 animate-pulse" />
      </div>
    );
  }

  // Authenticated → Dashboard, Unauthenticated → Landing Page
  if (isAuthenticated) {
    return <DashboardPage />;
  }

  return <LandingPage />;
}
