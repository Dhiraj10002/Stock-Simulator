import Link from "next/link";
export default function InfoPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-12"><Link href="/" className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">← Stock Simulator</Link><h1 className="text-3xl font-bold tracking-tight">{title}</h1><div className="space-y-6 text-sm leading-7 text-slate-600 dark:text-slate-300">{children}</div></main>;
}
