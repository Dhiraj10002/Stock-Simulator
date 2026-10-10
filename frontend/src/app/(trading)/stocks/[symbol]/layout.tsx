import type { Metadata } from "next";
// Client-only contract resolution does not yet provide verified server metadata.
export const metadata: Metadata = { robots: { index: false, follow: true }, alternates: { canonical: null } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
