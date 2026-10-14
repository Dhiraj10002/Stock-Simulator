import LandingScrollExperience from "./LandingScrollExperience";

// Static preview content stays on the server; only the controller hydrates.
export default function LandingScrollSections() {
  return (
    <LandingScrollExperience>
    <section className="section how scroll-section" id="how" data-scroll-scenes="3">
      <div className="scroll-pin" data-section-number="01">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">
                {"YOUR FIRST PAPER TRADE"}
              </div>
              <h2>
                {"Your first trade."}
                <br />
                <em>
                  {"Three simple steps."}
                </em>
              </h2>
            </div>
            <p>
              {"Scroll through your first paper trade. Start with virtual capital, make a decision and learn from the result."}
            </p>
          </div>
          <div className="how-grid">
            <div className="step-list" role="tablist" aria-label="How paper trading works">
              <button className="step active" id="step-tab-0" role="tab" aria-selected="true" aria-controls="step-panel-0" data-step="0">
                <span className="step-number mono">
                  {"01"}
                </span>
                <span className="step-body">
                  <strong>
                    {"Meet your virtual wallet."}
                  </strong>
                  <span>
                    {"Start with ₹10,00,000 virtual capital. Get comfortable with available funds and blocked margin."}
                  </span>
                  <span className="step-label">
                    {"YOUR STARTING POINT"}
                  </span>
                </span>
              </button>
              <button className="step" id="step-tab-1" role="tab" aria-selected="false" aria-controls="step-panel-1" data-step="1" tabIndex={-1}>
                <span className="step-number mono">
                  {"02"}
                </span>
                <span className="step-body">
                  <strong>
                    {"Make a paper decision."}
                  </strong>
                  <span>
                    {"Choose an instrument, review your chart, and check the product, quantity and required funds."}
                  </span>
                  <span className="step-label">
                    {"YOUR FIRST ORDER"}
                  </span>
                </span>
              </button>
              <button className="step" id="step-tab-2" role="tab" aria-selected="false" aria-controls="step-panel-2" data-step="2" tabIndex={-1}>
                <span className="step-number mono">
                  {"03"}
                </span>
                <span className="step-body">
                  <strong>
                    {"Review. Learn. Repeat."}
                  </strong>
                  <span>
                    {"Follow your positions, review the analytics, and reflect on your decisions with the educational AI mentor."}
                  </span>
                  <span className="step-label">
                    {"YOUR NEXT LESSON"}
                  </span>
                </span>
              </button>
            </div>
            <div className="step-window" data-stage="0">
              <div className="step-window-inner">
                <div className="step-window-top">
                  <span id="step-title">
                    {"YOUR VIRTUAL WALLET"}
                  </span>
                  <span className="window-dots" aria-hidden="true">
                    <i>
                    </i>
                    <i>
                    </i>
                    <i>
                    </i>
                  </span>
                </div>
                <div className="how-panel" tabIndex={0} id="step-panel-0" role="tabpanel" aria-labelledby="step-tab-0">
                  <div className="wallet-top">
                    <span>
                      {"VIRTUAL STARTING CAPITAL"}
                    </span>
                    <span>
                      {"ILLUSTRATIVE PREVIEW"}
                    </span>
                  </div>
                  <div className="wallet-total mono">
                    {"₹10,00,000"}
                    <span>
                      {".00"}
                    </span>
                  </div>
                  <div className="wallet-note">
                    {"A fresh start, without a real-money deposit."}
                  </div>
                  <div className="wallet-summary">
                    <div>
                      <span>
                        {"Available virtual funds"}
                      </span>
                      <strong className="mono">
                        {"₹10,00,000.00"}
                      </strong>
                    </div>
                    <div>
                      <span>
                        {"Blocked margin"}
                      </span>
                      <strong className="mono">
                        {"₹0.00"}
                      </strong>
                    </div>
                  </div>
                  <div className="wallet-foot">
                    {"Understand your funds before placing an order."}
                  </div>
                </div>
                <div className="how-panel" tabIndex={0} id="step-panel-1" role="tabpanel" aria-labelledby="step-tab-1" hidden>
                  <div className="preview-order-head">
                    <div className="symbol-icon">
                      <i>
                        {"RE"}
                      </i>
                      <span>
                        {"RELIANCE"}
                        <small>
                          {"NSE · Equity · Sample quote"}
                        </small>
                      </span>
                    </div>
                    <span className="buy-tag">
                      {"PAPER BUY"}
                    </span>
                  </div>
                  <div className="order-field">
                    <span>
                      {"Product"}
                    </span>
                    <b>
                      {"Delivery (CNC)"}
                    </b>
                  </div>
                  <div className="order-field">
                    <label htmlFor="demo-quantity">
                      {"Quantity"}
                    </label>
                    <input id="demo-quantity" type="number" min="1" max="1000" defaultValue="1" inputMode="numeric" />
                  </div>
                  <div className="order-field">
                    <span>
                      {"Illustrative required funds"}
                    </span>
                    <b className="mono" id="demo-funds">
                      {"₹1,226.40"}
                    </b>
                  </div>
                  <button className="button order-button" id="demo-order">
                    {"Preview paper order "}
                    <span className="arrow">
                      {"↗"}
                    </span>
                  </button>
                  <p className="order-result" id="order-result">
                    {"Interactive example only. No order is submitted."}
                  </p>
                </div>
                <div className="how-panel" tabIndex={0} id="step-panel-2" role="tabpanel" aria-labelledby="step-tab-2" hidden>
                  <div className="insight-top">
                    <div>
                      <span className="label">
                        {"ILLUSTRATIVE DAILY P&L"}
                      </span>
                      <strong className="mono">
                        {"+₹14,280.50"}
                      </strong>
                    </div>
                    <span className="change">
                      {"SAMPLE RESULT"}
                    </span>
                  </div>
                  <svg className="insight-chart" viewBox="0 0 420 100" role="img" aria-label="Illustrative portfolio performance chart">
                    <defs>
                      <linearGradient id="insight-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#8dced0" stopOpacity=".2">
                        </stop>
                        <stop offset="1" stopColor="#8dced0" stopOpacity="0">
                        </stop>
                      </linearGradient>
                    </defs>
                    <path stroke="#ffffff0a" fill="none" d="M0 25H420M0 60H420M0 90H420">
                    </path>
                    <path fill="url(#insight-fill)" d="M0 87L20 81L40 87L60 66L80 75L100 57L120 65L140 46L160 51L180 41L200 51L220 33L240 41L260 23L280 31L300 15L320 21L340 9L360 15L390 4L420 9V100H0Z">
                    </path>
                    <path stroke="#9ad0c5" strokeWidth="1.8" fill="none" d="M0 87L20 81L40 87L60 66L80 75L100 57L120 65L140 46L160 51L180 41L200 51L220 33L240 41L260 23L280 31L300 15L320 21L340 9L360 15L390 4L420 9">
                    </path>
                  </svg>
                  <div className="insight-feedback">
                    <i>
                      {"✳"}
                    </i>
                    <span>
                      {"Review why you entered and exited. A useful lesson comes from the process, as well as the P&L."}
                    </span>
                  </div>
                </div>
                <div className="step-window-footer">
                  <span id="step-count">
                    {"01 / 03 · ILLUSTRATIVE EXAMPLE"}
                  </span>
                  <button id="next-step">
                    {"Next step "}
                    <span>
                      {"→"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="workflow-facts">
            <span>
              <i>
                {"✓"}
              </i>
              {" Virtual capital"}
            </span>
            <span>
              <i>
                {"✓"}
              </i>
              {" NSE/NFO products"}
            </span>
            <span>
              <i>
                {"✓"}
              </i>
              {" Data during trading sessions"}
            </span>
          </div>
          <div className="scroll-meta">
            <span className="scene-count">
              {"01 / 03"}
            </span>
            <span className="scroll-cue">
              {"SCROLL TO YOUR NEXT STEP "}
              <span aria-hidden="true">
                {"↓"}
              </span>
            </span>
            <span>
              {"VIRTUAL FUNDS · ILLUSTRATIVE EXAMPLE"}
            </span>
          </div>
          <div className="scene-progress" aria-hidden="true">
            <i>
            </i>
          </div>
        </div>
      </div>
    </section>
    <section className="section features scroll-section" id="features" data-scroll-scenes="5">
      <div className="scroll-pin" data-section-number="02">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">
                {"THE PRACTICE DESK"}
              </div>
              <h2>
                {"Follow the market."}
                <br />
                <em>
                  {"Build your understanding."}
                </em>
              </h2>
            </div>
            <p>
              {"Scroll to explore trading, AI, analytics, news and watchlists. Five connected tools. One place to learn."}
            </p>
          </div>
          <div className="feature-chapter-layout">
            <div className="chapter-list" role="tablist" aria-label="Feature chapters">
              <button id="feature-tab-0" className="chapter-tab" role="tab" aria-controls="feature-panel-0" aria-selected="true" data-feature="0">
                <span className="chapter-num">
                  {"01"}
                </span>
                <span>
                  {"Paper trading"}
                  <small>
                    {"Practise a decision"}
                  </small>
                </span>
              </button>
              <button id="feature-tab-1" className="chapter-tab" role="tab" aria-controls="feature-panel-1" aria-selected="false" data-feature="1">
                <span className="chapter-num">
                  {"02"}
                </span>
                <span>
                  {"AI mentor"}
                  <small>
                    {"Ask a better question"}
                  </small>
                </span>
              </button>
              <button id="feature-tab-2" className="chapter-tab" role="tab" aria-controls="feature-panel-2" aria-selected="false" data-feature="2">
                <span className="chapter-num">
                  {"03"}
                </span>
                <span>
                  {"Analytics"}
                  <small>
                    {"Learn from the result"}
                  </small>
                </span>
              </button>
              <button id="feature-tab-3" className="chapter-tab" role="tab" aria-controls="feature-panel-3" aria-selected="false" data-feature="3">
                <span className="chapter-num">
                  {"04"}
                </span>
                <span>
                  {"News Desk"}
                  <small>
                    {"Find the context"}
                  </small>
                </span>
              </button>
              <button id="feature-tab-4" className="chapter-tab" role="tab" aria-controls="feature-panel-4" aria-selected="false" data-feature="4">
                <span className="chapter-num">
                  {"05"}
                </span>
                <span>
                  {"Watchlists"}
                  <small>
                    {"Keep ideas close"}
                  </small>
                </span>
              </button>
            </div>
            <div className="scene-perspective">
              <div className="feature-stage">
                <article id="feature-panel-0" role="tabpanel" tabIndex={0} aria-labelledby="feature-tab-0" className="scroll-feature-panel feature trade-feature">
                  <div>
                    <div className="feature-top">
                      <div className="icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M4 17L9 12L13 15L20 6M15 6H20V11">
                          </path>
                        </svg>
                      </div>
                      <span>
                        {"THE INDIAN MARKET / YOUR PRACTICE"}
                      </span>
                    </div>
                    <h3>
                      {"Real markets."}
                      <br />
                      {"Room to practise."}
                    </h3>
                    <p>
                      {"Practise delivery, intraday, futures and options across NSE/NFO. Explore charts and get familiar with market and limit orders."}
                    </p>
                    <div className="feature-products" role="group" aria-label="Explore paper trading products">
                      <button className="active" data-product="delivery" aria-pressed="true">
                        {"Delivery (CNC)"}
                      </button>
                      <button data-product="intraday" aria-pressed="false">
                        {"Intraday (MIS)"}
                      </button>
                      <button data-product="derivatives" aria-pressed="false">
                        {"Futures & options"}
                      </button>
                    </div>
                    <div className="product-note" id="product-note">
                      {"Understand holdings and full upfront funding."}
                    </div>
                  </div>
                  <div className="trade-visual">
                    <div className="mini-terminal">
                      <div className="mini-terminal-top">
                        <span>
                          {"RELIANCE / NSE EQUITY"}
                        </span>
                        <span className="sample">
                          {"SAMPLE"}
                        </span>
                      </div>
                      <div className="mini-terminal-price">
                        <strong className="mono">
                          {"₹1,226.40"}
                        </strong>
                        <span>
                          {"ILLUSTRATIVE"}
                        </span>
                      </div>
                      <svg className="mini-chart" viewBox="0 0 300 110" role="img" aria-label="Illustrative candlestick chart">
                        <defs>
                          <linearGradient id="feature-chart-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop stopColor="#6ed4e6" stopOpacity=".14">
                            </stop>
                            <stop offset="1" stopColor="#6ed4e6" stopOpacity="0">
                            </stop>
                          </linearGradient>
                        </defs>
                        <path stroke="#ffffff09" fill="none" d="M0 23H300M0 56H300M0 90H300M45 0V110M115 0V110M185 0V110M255 0V110">
                        </path>
                        <path fill="url(#feature-chart-fill)" d="M0 95L18 91L36 99L54 79L72 85L90 67L108 75L126 50L144 59L162 69L180 43L198 51L216 33L234 41L252 20L270 28L300 12V110H0Z">
                        </path>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M8 83V98" strokeWidth="1">
                          </path>
                          <rect x="5.3" y="88" width="5.4" height="4" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M20 78V94" strokeWidth="1">
                          </path>
                          <rect x="17.3" y="83" width="5.4" height="5" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M32 78V96" strokeWidth="1">
                          </path>
                          <rect x="29.3" y="83" width="5.4" height="7" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M44 70V96" strokeWidth="1">
                          </path>
                          <rect x="41.3" y="75" width="5.4" height="15" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M56 65V81" strokeWidth="1">
                          </path>
                          <rect x="53.3" y="70" width="5.4" height="5" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M68 65V82" strokeWidth="1">
                          </path>
                          <rect x="65.3" y="70" width="5.4" height="6" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M80 58V82" strokeWidth="1">
                          </path>
                          <rect x="77.3" y="63" width="5.4" height="13" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M92 55V69" strokeWidth="1">
                          </path>
                          <rect x="89.3" y="60" width="5.4" height="3" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M104 55V72" strokeWidth="1">
                          </path>
                          <rect x="101.3" y="60" width="5.4" height="6" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M116 46V72" strokeWidth="1">
                          </path>
                          <rect x="113.3" y="51" width="5.4" height="15" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M128 40V57" strokeWidth="1">
                          </path>
                          <rect x="125.3" y="45" width="5.4" height="6" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M140 40V59" strokeWidth="1">
                          </path>
                          <rect x="137.3" y="45" width="5.4" height="8" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M152 37V59" strokeWidth="1">
                          </path>
                          <rect x="149.3" y="42" width="5.4" height="11" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M164 31V48" strokeWidth="1">
                          </path>
                          <rect x="161.3" y="36" width="5.4" height="6" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M176 31V48" strokeWidth="1">
                          </path>
                          <rect x="173.3" y="36" width="5.4" height="6" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M188 25V48" strokeWidth="1">
                          </path>
                          <rect x="185.3" y="30" width="5.4" height="12" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M200 20V36" strokeWidth="1">
                          </path>
                          <rect x="197.3" y="25" width="5.4" height="5" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M212 20V39" strokeWidth="1">
                          </path>
                          <rect x="209.3" y="25" width="5.4" height="8" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M224 15V39" strokeWidth="1">
                          </path>
                          <rect x="221.3" y="20" width="5.4" height="13" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M236 15V30" strokeWidth="1">
                          </path>
                          <rect x="233.3" y="20" width="5.4" height="4" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M248 12V30" strokeWidth="1">
                          </path>
                          <rect x="245.3" y="17" width="5.4" height="7" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M260 7V23" strokeWidth="1">
                          </path>
                          <rect x="257.3" y="12" width="5.4" height="5" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#f28c9e" fill="#f28c9e">
                          <path d="M272 7V22" strokeWidth="1">
                          </path>
                          <rect x="269.3" y="12" width="5.4" height="4" rx=".8" stroke="none">
                          </rect>
                        </g>
                        <g aria-hidden="true" stroke="#53d8b1" fill="#53d8b1">
                          <path d="M284 2V22" strokeWidth="1">
                          </path>
                          <rect x="281.3" y="7" width="5.4" height="9" rx=".8" stroke="none">
                          </rect>
                        </g>
                      </svg>
                      <div className="mini-terminal-footer">
                        <span>
                          {"09:15"}
                        </span>
                        <span>
                          {"ILLUSTRATIVE CHART"}
                        </span>
                        <span>
                          {"15:30"}
                        </span>
                      </div>
                    </div>
                    <div className="floating-filled">
                      <span>
                        {"✓"}
                      </span>
                      {" Preview a paper order. Keep your savings."}
                    </div>
                  </div>
                </article>
                <article id="feature-panel-1" role="tabpanel" tabIndex={0} aria-labelledby="feature-tab-1" className="scroll-feature-panel feature ai-feature">
                  <div className="feature-top">
                    <div className="icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 3L14 9L20 11L14 13L12 20L10 13L4 11L10 9Z">
                        </path>
                        <path d="M19 3V7M17 5H21">
                        </path>
                      </svg>
                    </div>
                    <span>
                      {"EDUCATIONAL AI MENTOR"}
                    </span>
                  </div>
                  <h3>
                    {"Ask better questions."}
                    <br />
                    {"Learn with context."}
                  </h3>
                  <p>
                    {"Explore concepts, portfolio risk and the habits behind your decisions with the AI Trade Copilot."}
                  </p>
                  <div className="ai-bubble">
                    <b>
                      {"ILLUSTRATIVE EDUCATIONAL ANSWER"}
                    </b>
                    <span className="ai-question" id="ai-question">
                      {"How should I think about risk?"}
                    </span>
                    <span id="ai-answer">
                      {"“Start with position sizing. How much of your virtual portfolio is in one trade?”"}
                    </span>
                  </div>
                  <div className="ai-prompt" role="group" aria-label="Sample AI questions">
                    <button className="active" data-ai="risk" aria-pressed="true">
                      {"Risk"}
                    </button>
                    <button data-ai="orders" aria-pressed="false">
                      {"Orders"}
                    </button>
                    <button data-ai="review" aria-pressed="false">
                      {"Review"}
                    </button>
                  </div>
                </article>
                <article id="feature-panel-2" role="tabpanel" tabIndex={0} aria-labelledby="feature-tab-2" className="scroll-feature-panel feature feature-small portfolio-feature">
                  <div className="feature-top">
                    <div className="icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 20H21M6 16V10M12 16V5M18 16V8">
                        </path>
                      </svg>
                    </div>
                    <span>
                      {"PORTFOLIO & ANALYTICS"}
                    </span>
                  </div>
                  <h3>
                    {"See your progress."}
                    <br />
                    {"Find your next lesson."}
                  </h3>
                  <p>
                    {"Review positions, daily P&L, win rate and profit factor. Make your trading history easier to understand."}
                  </p>
                  <div className="mini-metric">
                    <span>
                      {"SAMPLE PORTFOLIO"}
                    </span>
                    <strong className="mono">
                      {"₹10,42,860"}
                    </strong>
                  </div>
                  <div className="tiny-bars" aria-hidden="true">
                    <i style={{"height": "22px"}}>
                    </i>
                    <i style={{"height": "33px"}}>
                    </i>
                    <i style={{"height": "28px"}}>
                    </i>
                    <i style={{"height": "43px"}}>
                    </i>
                    <i style={{"height": "35px"}}>
                    </i>
                    <i style={{"height": "51px"}}>
                    </i>
                    <i style={{"height": "46px"}}>
                    </i>
                    <i style={{"height": "58px"}}>
                    </i>
                    <i style={{"height": "52px"}}>
                    </i>
                  </div>
                </article>
                <article id="feature-panel-3" role="tabpanel" tabIndex={0} aria-labelledby="feature-tab-3" className="scroll-feature-panel feature feature-small news-feature">
                  <div className="feature-top">
                    <div className="icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <rect x="4" y="4" width="16" height="16" rx="2">
                        </rect>
                        <path d="M8 8H16M8 12H12M8 16H16M15 12H16">
                        </path>
                      </svg>
                    </div>
                    <span>
                      {"NEWS DESK"}
                    </span>
                  </div>
                  <h3>
                    {"A wider lens"}
                    <br />
                    {"on the market."}
                  </h3>
                  <p>
                    {"Find context around the stocks you follow. Explore market headlines with symbol, sector and sentiment filters."}
                  </p>
                  <div className="news-list">
                    <div className="news-preview-heading">
                      {"NEWS DESK / ILLUSTRATIVE CATEGORIES"}
                    </div>
                    <div className="news-preview-row">
                      <i aria-hidden="true">
                        {"C"}
                      </i>
                      <div>
                        <strong>
                          {"Company updates"}
                        </strong>
                        <small>
                          {"Find context around your watchlist"}
                        </small>
                      </div>
                    </div>
                    <div className="news-preview-row">
                      <i aria-hidden="true">
                        {"S"}
                      </i>
                      <div>
                        <strong>
                          {"Sector trends"}
                        </strong>
                        <small>
                          {"Explore the wider market picture"}
                        </small>
                      </div>
                    </div>
                    <div className="news-preview-row">
                      <i aria-hidden="true">
                        {"M"}
                      </i>
                      <div>
                        <strong>
                          {"Market context"}
                        </strong>
                        <small>
                          {"Browse headlines and sentiment filters"}
                        </small>
                      </div>
                    </div>
                  </div>
                  <div className="news-chips">
                    <span>
                      {"By symbol"}
                    </span>
                    <span>
                      {"By sector"}
                    </span>
                    <span>
                      {"By sentiment"}
                    </span>
                  </div>
                </article>
                <article id="feature-panel-4" role="tabpanel" tabIndex={0} aria-labelledby="feature-tab-4" className="scroll-feature-panel feature feature-small watch-feature">
                  <div className="feature-top">
                    <div className="icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <circle cx="10" cy="10" r="5">
                        </circle>
                        <path d="M14 14L20 20">
                        </path>
                      </svg>
                    </div>
                    <span>
                      {"SEARCH & WATCHLISTS"}
                    </span>
                  </div>
                  <h3>
                    {"Keep your next"}
                    <br />
                    {"idea within reach."}
                  </h3>
                  <p>
                    {"Find instruments and keep the stocks you follow together. Try the preview watchlist below."}
                  </p>
                  <div className="watch-items">
                    <div className="watch-item">
                      <span style={{"color": "#c1d5e2"}}>
                        {"RELIANCE"}
                      </span>
                      <span>
                        {"NSE Equity"}
                      </span>
                      <button className="saved" data-watch="RELIANCE" aria-pressed="true" aria-label="Remove RELIANCE from preview watchlist">
                        {"★"}
                      </button>
                    </div>
                    <div className="watch-item">
                      <span style={{"color": "#c1d5e2"}}>
                        {"TCS"}
                      </span>
                      <span>
                        {"NSE Equity"}
                      </span>
                      <button data-watch="TCS" aria-pressed="false" aria-label="Add TCS to preview watchlist">
                        {"☆"}
                      </button>
                    </div>
                    <div className="watch-item">
                      <span style={{"color": "#c1d5e2"}}>
                        {"INFY"}
                      </span>
                      <span>
                        {"NSE Equity"}
                      </span>
                      <button data-watch="INFY" aria-pressed="false" aria-label="Add INFY to preview watchlist">
                        {"☆"}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
          <div className="scroll-meta">
            <span className="scene-count">
              {"01 / 05"}
            </span>
            <span className="scroll-cue">
              {"SCROLL TO EXPLORE "}
              <span aria-hidden="true">
                {"↓"}
              </span>
            </span>
            <span>
              {"SAMPLE DATA · EDUCATIONAL PREVIEW"}
            </span>
          </div>
          <div className="scene-progress" aria-hidden="true">
            <i>
            </i>
          </div>
        </div>
      </div>
    </section>
    <section className="section reviews scroll-section" id="testimonials" data-scroll-scenes="3">
      <div className="scroll-pin" data-section-number="03">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">
                {"REVIEWS & LEARNING STORIES"}
              </div>
              <h2>
                {"Different goals."}
                <br />
                <em>
                  {"A place to begin."}
                </em>
              </h2>
            </div>
            <p>
              <span className="stories-label">
                {"Illustrative stories · not verified reviews"}
              </span>
              {"Scroll through three possible learning journeys. These are illustrative personas, not customer testimonials."}
            </p>
          </div>
          <div className="scene-perspective">
            <div className="story-shell" id="story-scene" role="region" aria-label="Illustrative learning story" tabIndex={0}>
              <div className="story-content">
                <div>
                  <div className="story-kicker" id="story-kicker">
                    {"ILLUSTRATIVE LEARNER STORY"}
                  </div>
                  <blockquote className="story-quote" id="story-quote">
                    {"I wanted a place to understand orders before putting my savings at risk."}
                  </blockquote>
                  <div className="story-person">
                    <div className="story-avatar" id="story-avatar" aria-hidden="true">
                      {"FL"}
                    </div>
                    <div>
                      <strong id="story-role">
                        {"First-time market learner"}
                      </strong>
                      <small>
                        {"Example persona · Fictional quote"}
                      </small>
                    </div>
                  </div>
                </div>
                <div className="story-map">
                  <div className="story-map-label">
                    {"A POSSIBLE PRACTICE PATH"}
                  </div>
                  <h4 id="story-goal">
                    {"Make the first"}
                    <br />
                    {"step feel clearer."}
                  </h4>
                  <div className="story-path" id="story-path">
                    <div>
                      <span>
                        {"01"}
                      </span>
                      {"Find a stock"}
                    </div>
                    <div>
                      <span>
                        {"02"}
                      </span>
                      {"Place a paper order"}
                    </div>
                    <div>
                      <span>
                        {"03"}
                      </span>
                      {"Review your result"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="story-tabs" role="group" aria-label="Choose an illustrative learning story">
                <button className="active" data-story="learner" aria-pressed="true">
                  <span className="story-tab-icon">
                    {"◎"}
                  </span>
                  <span>
                    {"First-time learners"}
                    <small>
                      {"Understand the basics"}
                    </small>
                  </span>
                </button>
                <button data-story="explorer" aria-pressed="false">
                  <span className="story-tab-icon">
                    {"↗"}
                  </span>
                  <span>
                    {"Strategy explorers"}
                    <small>
                      {"Practise your process"}
                    </small>
                  </span>
                </button>
                <button data-story="educator" aria-pressed="false">
                  <span className="story-tab-icon">
                    {"▤"}
                  </span>
                  <span>
                    {"Educators"}
                    <small>
                      {"Make concepts tangible"}
                    </small>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className="scroll-meta">
            <span className="scene-count">
              {"01 / 03"}
            </span>
            <span className="scroll-cue">
              {"SCROLL TO THE NEXT STORY "}
              <span aria-hidden="true">
                {"↓"}
              </span>
            </span>
            <span>
              {"FICTIONAL QUOTES · ILLUSTRATIVE STORIES"}
            </span>
          </div>
          <div className="scene-progress" aria-hidden="true">
            <i>
            </i>
          </div>
          <div className="review-bottom">
            <p>
              {"Tried the platform? Your feedback can help make the next learning journey better."}
            </p>
            <a href="https://github.com/Dhiraj10002/Stock-Simulator" target="_blank" rel="noopener noreferrer">
              {"Explore the project on GitHub "}
              <span>
                {"↗"}
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
    </LandingScrollExperience>
  );
}
