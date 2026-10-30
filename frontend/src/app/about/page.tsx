import InfoPage from "@/components/shared/InfoPage";
export default function AboutPage() {
  return (
    <InfoPage title="Learn by paper trading">
      <p>
        Stock Simulator is an educational project for practising Indian market order flows with virtual funds. It supports NSE equities and NFO futures and options.
      </p>
      <p>
        Find instruments, review price and required funds, place a paper order, and follow orders and positions. Live, last available and unavailable labels help you understand the data you are seeing.
      </p>
      <p>
        All trades and balances are simulated. Margin and settlement use simulator rules and may differ from a real broker.
      </p>
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Created by Dhiraj Gupta
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <a
            className="font-semibold text-cyan-800 underline dark:text-cyan-300 hover:text-cyan-600"
            href="https://dhiraj-my-portfolio.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Portfolio
          </a>
          <span>•</span>
          <a
            className="font-semibold text-cyan-800 underline dark:text-cyan-300 hover:text-cyan-600"
            href="https://www.linkedin.com/in/dhirajgupta1002/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <span>•</span>
          <a
            className="font-semibold text-cyan-800 underline dark:text-cyan-300 hover:text-cyan-600"
            href="https://github.com/Dhiraj10002"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Profile
          </a>
          <span>•</span>
          <a
            className="font-semibold text-cyan-800 underline dark:text-cyan-300 hover:text-cyan-600"
            href="https://github.com/Dhiraj10002/Stock-Simulator"
            target="_blank"
            rel="noopener noreferrer"
          >
            Repository Source Code
          </a>
        </div>
      </div>
    </InfoPage>
  );
}
