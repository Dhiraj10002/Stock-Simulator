"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { mountLandingScroll } from "./landing-scroll-controller";
import styles from "./LandingScrollSections.module.css";

export default function LandingScrollExperience({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (rootRef.current) return mountLandingScroll(rootRef.current);
  }, []);
  return <div ref={rootRef} className={`${styles.root} landing-scroll-sections`}>{children}</div>;
}
