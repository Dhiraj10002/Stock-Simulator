import { PUBLIC_PAGES, publicPageMetadata } from "@/lib/seo";
const page = PUBLIC_PAGES[5];
export const metadata = publicPageMetadata(page.path, page.title, page.description);
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
