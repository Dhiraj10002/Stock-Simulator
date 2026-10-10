import LandingPage from "@/components/landing/LandingPage";
import { publicPageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata = publicPageMetadata("/", "Stock Simulator — Paper Trading in India", SITE_DESCRIPTION);

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION, inLanguage: "en-IN" },
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png` },
    { "@type": "WebApplication", name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION, applicationCategory: "EducationalApplication", operatingSystem: "Web browser", browserRequirements: "Requires JavaScript for trading features" },
  ],
};

export default function Page() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><LandingPage /></>;
}
