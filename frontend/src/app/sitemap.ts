import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only report lastModified when a real content update date is known.
  return PUBLIC_PAGES.map(({ path }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
  }));
}
