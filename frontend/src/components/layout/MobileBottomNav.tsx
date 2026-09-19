"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bookmark,
  SlidersHorizontal,
  ClipboardList,
  PieChart,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  isCenter?: boolean;
}

const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/trade", label: "Trade", icon: SlidersHorizontal, isCenter: true },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)] select-none shadow-2xl"
    >
      <div className="flex items-center justify-around px-2 py-1.5 h-14">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          if (item.isCenter) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative -top-3 flex flex-col items-center group"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                    isActive
                      ? "bg-gradient-to-tr from-cyan-500 to-emerald-400 text-slate-950 shadow-cyan-500/40 ring-4 ring-slate-950"
                      : "bg-slate-800 text-slate-300 hover:text-white border border-slate-700 shadow-slate-900/60 ring-4 ring-slate-950"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-[10px] font-bold tracking-tight mt-0.5 ${
                    isActive ? "text-cyan-400" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-lg transition-colors active:scale-95 ${
                isActive
                  ? "text-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400" />
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium tracking-tight ${
                  isActive ? "text-cyan-300 font-semibold" : "text-slate-400"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
