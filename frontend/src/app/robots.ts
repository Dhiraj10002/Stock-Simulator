import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.VERCEL_ENV === "preview"
        ? { userAgent: "*", disallow: "/" }
        : { userAgent: "*", allow: "/", disallow: ["/api/", "/api/backend/", "/dashboard", "/portfolio", "/orders", "/watchlist", "/analytics"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
