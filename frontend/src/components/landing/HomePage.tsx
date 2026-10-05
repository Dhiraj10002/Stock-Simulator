import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import HomeActions from "./HomeActions";

const products = [
  { title: "Delivery (CNC)", description: "Practise buying shares and holding them in your virtual portfolio.", hint: "A simple place to start", icon: TrendingUp, href: "/stocks" },
  { title: "Intraday (MIS)", description: "Practise stock trades within the trading day, with simulated margin.", hint: "Learn entry and exit", icon: BarChart3, href: "/stocks" },
  { title: "Futures & Options", description: "Explore NFO contracts with clear expiry dates, lot sizes and required funds.", hint: "Understand leverage first", icon: Layers, href: "/options" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-900">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-white focus:p-4">Skip to content</a>
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-800 text-white"><TrendingUp aria-hidden className="h-5 w-5" /></span><span>Stock Simulator<span className="block text-[10px] font-medium tracking-wider text-slate-500">PAPER TRADING</span></span></Link>
          <nav aria-label="Public navigation" className="flex items-center gap-6"><a href="#how-it-works" className="hidden text-sm font-medium text-slate-600 hover:text-cyan-800 sm:block">How it works</a><HomeActions compact /></nav>
        </div>
      </header>
      <main id="main-content">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900"><ShieldCheck aria-hidden className="h-4 w-4" /> Real market learning. Virtual money.</p>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">Practice Indian stock trading <span className="text-cyan-800">with virtual money.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">Build confidence one paper trade at a time. Find a stock, understand the order, and see how your portfolio changes.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4"><HomeActions /><a href="#platform-preview" className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-semibold text-slate-700 hover:text-cyan-800">See the platform <ArrowRight aria-hidden className="h-4 w-4" /></a></div>
            <p className="mt-4 text-xs leading-5 text-slate-600">NSE equities · NFO derivatives · No real-money orders</p>
          </div>
          <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5"><span className="text-sm font-semibold">Your practice account</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Illustrative preview</span></div>
            <p className="mt-7 text-sm text-slate-600">Starting virtual balance</p><p className="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">₹10,00,000</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">Virtual capital to practise with. No deposit required to start.</p>
            <ol className="mt-7 space-y-3">{["Find an NSE stock or NFO contract", "Review price, quantity and funds", "Track the position and practise exiting"].map((step,i)=><li key={step} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-cyan-800">0{i+1}</span>{step}</li>)}</ol>
            <p className="mt-5 text-xs leading-5 text-slate-500">Prices and valuation depend on the market session and data availability. Every trading screen shows its data status.</p>
          </div>
        </section>
        <section aria-labelledby="products-title" className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-800">Choose your starting point</p><h2 id="products-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Three ways to practise.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-600">Start with delivery. Explore intraday and derivatives when you understand the basics.</p></div>
          <div className="grid gap-4 md:grid-cols-3">{products.map(({title,description,hint,icon:Icon,href})=><Link prefetch={false} key={title} href={href} className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-cyan-700 focus-visible:outline-2 focus-visible:outline-cyan-800"><Icon aria-hidden className="mb-5 h-6 w-6 text-cyan-800" /><h3 className="text-lg font-bold">{title}</h3><p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{description}</p><p className="mt-6 flex items-center justify-between gap-3 text-xs font-semibold text-cyan-800">{hint}<ArrowRight aria-hidden className="h-4 w-4" /></p></Link>)}</div>
        </section>
        <section id="how-it-works" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8"><p className="text-xs font-semibold uppercase tracking-widest text-cyan-800">From curious to confident</p><h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Your first paper trade, in three steps.</h2><ol className="mt-8 grid gap-7 md:grid-cols-3">{[{title:"Create your practice account",text:"Get virtual funds and a place to track your orders and positions."},{title:"Choose an instrument",text:"Check the price and its data status. Review product, quantity and required funds."},{title:"Place a paper order",text:"Follow the result in Orders, then manage or exit the position in Portfolio."}].map((step,i)=><li key={step.title}><span className="text-sm font-bold text-cyan-800">0{i+1}</span><h3 className="mt-2 text-base font-bold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p></li>)}</ol></div>
        </section>
        <section id="platform-preview" className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-800">A clear trading workspace</p><h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Price, chart and order. Together.</h2></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">Illustrative preview · sample data</span></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><Image src="/platform-preview.png" alt="Stock Simulator stock details screen showing an authentic application layout with a chart and paper order ticket; prices are illustrative sample data." width={1440} height={1000} sizes="(max-width: 1280px) 100vw, 1280px" className="h-auto w-full" /></div><p className="mt-4 text-xs leading-5 text-slate-600">Application screenshot with sample data. It is not a live quote or a performance result.</p></section>
        <section className="border-t border-slate-200 bg-cyan-50 px-5 py-12 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-bold tracking-tight">Make your first move a practice move.</h2><p className="mt-2 text-sm text-slate-600">Learn the process before putting real money at risk.</p></div><HomeActions /></div></section>
      </main>
      <footer className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-5"><p className="text-sm font-semibold">Stock Simulator</p><nav aria-label="Footer" className="flex flex-wrap gap-5 text-xs font-medium text-slate-600"><a href="https://github.com/Dhiraj10002/Stock-Simulator" target="_blank" rel="noreferrer">GitHub ↗</a><Link prefetch={false} href="/about">About</Link><Link prefetch={false} href="/privacy">Privacy</Link><Link prefetch={false} href="/terms">Terms</Link></nav></div><p className="mt-5 max-w-3xl text-xs leading-5 text-slate-600">An educational paper trading project. Trades and balances are simulated; no securities are bought or sold. Simulated results do not predict real trading results. This platform does not provide investment advice.</p></footer>
    </div>
  );
}
