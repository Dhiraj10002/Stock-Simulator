"use client";

import React, { useEffect } from "react";
import AnalyticsConsole from "@/components/analytics/AnalyticsConsole";

type PerformanceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  token: string | null;
};

export default function PerformanceModal({
  isOpen,
  onClose,
  apiUrl,
  token,
}: PerformanceModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <AnalyticsConsole apiUrl={apiUrl} token={token} onClose={onClose} />
      </div>
    </div>
  );
}
