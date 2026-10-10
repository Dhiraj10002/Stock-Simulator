import Image from "next/image";

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return <Image src="/brand/stock-simulator-mark.svg" alt="" aria-hidden="true" width={128} height={128} className={`shrink-0 ${className}`} />;
}

export default function BrandLogo({ className = "", compact = false, tagline }: { className?: string; compact?: boolean; tagline?: string }) {
  return (
    <span role="img" aria-label="Stock Simulator" className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark />
      <span aria-hidden="true" className={compact ? "hidden sm:block" : "block"}>
        <span className="block text-[13px] font-extrabold uppercase tracking-tight whitespace-nowrap">Stock Simulator</span>
        {tagline && <span className="block text-[9px] uppercase tracking-wider opacity-70">{tagline}</span>}
      </span>
    </span>
  );
}
