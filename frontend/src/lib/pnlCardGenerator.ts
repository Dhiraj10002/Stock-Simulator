/**
 * 1-Click P&L Social Card Canvas Generator
 * Renders institutional-grade 1200x675 (16:9) share cards for Twitter, WhatsApp, LinkedIn, and Instagram.
 */

export interface PnlCardData {
  userName?: string;
  totalPnlPaise: number;
  roiPct: number;
  pnlType?: "SESSION" | "REALIZED" | "UNREALIZED" | "ALL_TIME";
  winRatePct?: number;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  disciplineGrade?: string;
  bestTradeSymbol?: string;
  bestTradePnlPaise?: number;
  capitalPaise?: number;
  dateStr?: string;
}

export type PnlCardTheme = "institutional" | "cyber" | "aurora";

export interface PnlCardOptions {
  theme: PnlCardTheme;
  hideRupeeAmount?: boolean;
  includeDiscipline?: boolean;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

function formatPaiseValue(paise: number): string {
  const abs = Math.abs(paise) / 100;
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${paise < 0 ? "-" : "+"}₹${formatted}`;
}

export function drawPnlCard(
  canvas: HTMLCanvasElement,
  data: PnlCardData,
  options: PnlCardOptions = { theme: "institutional" }
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = 1200;
  const height = 675;
  canvas.width = width;
  canvas.height = height;

  const isProfit = data.totalPnlPaise >= 0;
  const { theme, hideRupeeAmount = false } = options;

  // 1. BASE BACKGROUND
  if (theme === "cyber") {
    ctx.fillStyle = "#03060c";
    ctx.fillRect(0, 0, width, height);

    // Subtle cyber grid
    ctx.strokeStyle = "rgba(6, 182, 212, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (theme === "aurora") {
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#030712");
    bgGrad.addColorStop(0.5, "#0b0f24");
    bgGrad.addColorStop(1, "#030712");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Multi-stop Aurora Auras
    const aura1 = ctx.createRadialGradient(250, 150, 0, 250, 150, 450);
    aura1.addColorStop(0, "rgba(59, 130, 246, 0.18)");
    aura1.addColorStop(1, "transparent");
    ctx.fillStyle = aura1;
    ctx.fillRect(0, 0, width, height);

    const aura2 = ctx.createRadialGradient(950, 200, 0, 950, 200, 450);
    aura2.addColorStop(0, isProfit ? "rgba(16, 185, 129, 0.22)" : "rgba(244, 63, 94, 0.22)");
    aura2.addColorStop(1, "transparent");
    ctx.fillStyle = aura2;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Default: Institutional Obsidian
    const bgGrad = ctx.createRadialGradient(600, 320, 50, 600, 320, 700);
    bgGrad.addColorStop(0, isProfit ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)");
    bgGrad.addColorStop(0.6, "#070a14");
    bgGrad.addColorStop(1, "#03050a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Diagonal texture pattern
    ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
    ctx.lineWidth = 1;
    for (let i = -width; i < width * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }
  }

  // Radial highlight behind central P&L
  const centerGlow = ctx.createRadialGradient(600, 260, 20, 600, 260, 320);
  centerGlow.addColorStop(0, isProfit ? "rgba(16, 185, 129, 0.22)" : "rgba(244, 63, 94, 0.22)");
  centerGlow.addColorStop(1, "transparent");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, width, height);

  // Card Outer Edge Border & Corner Highlights
  ctx.strokeStyle = isProfit ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundRect(ctx, 24, 24, width - 48, height - 48, 28);
  ctx.stroke();

  // Subtle inner sheen line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, 26, 26, width - 52, height - 52, 26);
  ctx.stroke();

  // =========================================================================
  // 2. HEADER: Brand Logo & Verified Pill
  // =========================================================================

  // Brand SS Icon Badge
  const logoX = 64;
  const logoY = 60;
  const logoSize = 48;
  const logoGrad = ctx.createLinearGradient(logoX, logoY, logoX + logoSize, logoY + logoSize);
  logoGrad.addColorStop(0, "#06b6d4");
  logoGrad.addColorStop(0.5, "#3b82f6");
  logoGrad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = logoGrad;
  ctx.beginPath();
  roundRect(ctx, logoX, logoY, logoSize, logoSize, 14);
  ctx.fill();

  // "SS" letters
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SS", logoX + logoSize / 2, logoY + logoSize / 2 + 1);

  // Brand Name
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.fillText("STOCK SIMULATOR", logoX + logoSize + 16, logoY + 3);

  // Sub-brand
  ctx.fillStyle = "#38bdf8";
  ctx.font = "600 11px system-ui, -apple-system, monospace";
  ctx.letterSpacing = "2px";
  ctx.fillText("INSTITUTIONAL PAPER DESK", logoX + logoSize + 16, logoY + 28);
  ctx.letterSpacing = "0px";

  // Right Header: Verified Paper Badge Pill
  const pillW = 280;
  const pillH = 38;
  const pillX = width - 64 - pillW;
  const pillY = 64;

  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, pillX, pillY, pillW, pillH, 19);
  ctx.fill();
  ctx.stroke();

  // Green Live Dot
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(pillX + 22, pillY + pillH / 2, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Verified text
  ctx.fillStyle = "#34d399";
  ctx.font = "bold 12px system-ui, -apple-system, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("VERIFIED PAPER TRADING", pillX + 36, pillY + pillH / 2);

  // Date IST
  const dateText = data.dateStr || new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
  ctx.font = "500 11px system-ui, -apple-system, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${dateText} • 15:30 IST`, width - 68, pillY + pillH + 16);

  // =========================================================================
  // 3. CENTER HERO: Main P&L and ROI
  // =========================================================================

  // Session Pill Badge
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
  ctx.font = "bold 13px system-ui, -apple-system, monospace";
  const pnlLabel =
    data.pnlType === "REALIZED"
      ? "● NET REALIZED PERFORMANCE"
      : data.pnlType === "UNREALIZED"
      ? "● UNREALIZED POSITION RETURNS"
      : "● SESSION TRADING NET P&L";
  ctx.fillText(pnlLabel, width / 2, 185);

  // Main P&L Number
  const pnlString = hideRupeeAmount
    ? (data.roiPct >= 0 ? `+${data.roiPct.toFixed(2)}% ROI` : `${data.roiPct.toFixed(2)}% ROI`)
    : formatPaiseValue(data.totalPnlPaise);

  ctx.fillStyle = isProfit ? "#10b981" : "#f43f5e";
  ctx.font = "900 68px system-ui, -apple-system, sans-serif";
  ctx.shadowColor = isProfit ? "rgba(16, 185, 129, 0.45)" : "rgba(244, 63, 94, 0.45)";
  ctx.shadowBlur = 24;
  ctx.fillText(pnlString, width / 2, 252);

  // Reset shadow for subsequent elements
  ctx.shadowBlur = 0;

  // ROI & Status Pill
  const roiBadgeText = `${isProfit ? "▲" : "▼"} ${isProfit ? "+" : ""}${data.roiPct.toFixed(2)}% ROI ON CAPITAL`;
  ctx.font = "bold 15px system-ui, -apple-system, monospace";
  const roiTextWidth = ctx.measureText(roiBadgeText).width;
  const roiPillW = roiTextWidth + 36;
  const roiPillH = 36;
  const roiPillX = (width - roiPillW) / 2;
  const roiPillY = 308;

  ctx.fillStyle = isProfit ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)";
  ctx.strokeStyle = isProfit ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, roiPillX, roiPillY, roiPillW, roiPillH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isProfit ? "#34d399" : "#fb7185";
  ctx.fillText(roiBadgeText, width / 2, roiPillY + roiPillH / 2);

  // =========================================================================
  // 4. METRICS ROW: 4 Institutional Stats Chips (Y: 380 - 520)
  // =========================================================================

  const cardGap = 20;
  const cardW = 252;
  const cardH = 120;
  const startX = (width - (cardW * 4 + cardGap * 3)) / 2;
  const cardY = 385;

  const chips = [
    {
      label: "WIN RATE",
      value: data.winRatePct !== undefined ? `${data.winRatePct.toFixed(1)}%` : "N/A",
      sub: `${data.winningTrades ?? 0}W / ${data.losingTrades ?? 0}L`,
      accent: "#38bdf8",
    },
    {
      label: "AI DISCIPLINE",
      value: data.disciplineGrade || "A",
      sub: "Institutional Rating",
      accent: "#a78bfa",
    },
    {
      label: "TOP COUNTER",
      value: data.bestTradeSymbol || "NIFTY",
      sub: data.bestTradePnlPaise ? formatPaiseValue(data.bestTradePnlPaise) : "Equities / F&O",
      accent: isProfit ? "#34d399" : "#f43f5e",
    },
    {
      label: "VIRTUAL CAPITAL",
      value: "₹10,00,000",
      sub: "Zero Risk Seed",
      accent: "#38bdf8",
    },
  ];

  chips.forEach((chip, i) => {
    const x = startX + i * (cardW + cardGap);

    // Card background & glass sheen
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x, cardY, cardW, cardH, 18);
    ctx.fill();
    ctx.stroke();

    // Top highlight line on each chip
    ctx.strokeStyle = `${chip.accent}33`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 24, cardY);
    ctx.lineTo(x + cardW - 24, cardY);
    ctx.stroke();

    // Label
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
    ctx.font = "bold 11px system-ui, -apple-system, monospace";
    ctx.fillText(chip.label, x + 18, cardY + 16);

    // Value
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(chip.value, x + 18, cardY + 40);

    // Subtitle
    ctx.fillStyle = chip.accent;
    ctx.font = "600 12px system-ui, -apple-system, monospace";
    ctx.fillText(chip.sub, x + 18, cardY + 84);
  });

  // =========================================================================
  // 5. FOOTER: Domain branding & Disclaimer
  // =========================================================================

  const footerY = 580;

  // Separator rule
  const sepGrad = ctx.createLinearGradient(64, footerY, width - 64, footerY);
  sepGrad.addColorStop(0, "transparent");
  sepGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.12)");
  sepGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = sepGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, footerY);
  ctx.lineTo(width - 64, footerY);
  ctx.stroke();

  // Left Footer: Trader Name & Handle
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 12px system-ui, -apple-system, monospace";
  const traderDisplay = data.userName ? `Trader: ${data.userName} • ` : "";
  const domain = typeof window !== "undefined" && window.location?.host ? window.location.host : "stock-simulator-dev.vercel.app";
  ctx.fillText(`${traderDisplay}${domain}`, 64, footerY + 36);

  // Right Footer: Risk-Free Notice
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
  ctx.font = "500 11px system-ui, -apple-system, sans-serif";
  ctx.fillText("100% Simulated Paper Trading • Real NSE/NFO Market Data Engine", width - 64, footerY + 36);
}

function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://stock-simulator-dev.vercel.app";
}

export function exportPnlCardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1.0);
  });
}

export function downloadPnlCard(canvas: HTMLCanvasElement, filename = "stocksim_pnl_card.png"): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyPnlCardToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await exportPnlCardBlob(canvas);
    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function getTwitterShareUrl(data: PnlCardData): string {
  const isProfit = data.totalPnlPaise >= 0;
  const pnlStr = formatPaiseValue(data.totalPnlPaise);
  const text = `Just wrapped up my trading session on @StockSimulator 🚀\n\n` +
    `📈 Returns: ${pnlStr} (${isProfit ? "+" : ""}${data.roiPct.toFixed(2)}% ROI)\n` +
    (data.winRatePct ? `🎯 Win Rate: ${data.winRatePct.toFixed(1)}%\n` : "") +
    (data.disciplineGrade ? `🛡️ AI Discipline Grade: ${data.disciplineGrade}\n\n` : "\n") +
    `Practicing institutional NSE equities & NFO derivatives with zero financial risk. Check it out:`;
  const url = getAppOrigin();
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=TradingPnl,NSE,PaperTrading,StockSimulator`;
}

export function getWhatsAppShareUrl(data: PnlCardData): string {
  const isProfit = data.totalPnlPaise >= 0;
  const pnlStr = formatPaiseValue(data.totalPnlPaise);
  const text = `*Stock Simulator Trading Session Update*\n\n` +
    `💰 *Net Returns:* ${pnlStr} (${isProfit ? "+" : ""}${data.roiPct.toFixed(2)}% ROI)\n` +
    (data.winRatePct ? `🎯 *Win Rate:* ${data.winRatePct.toFixed(1)}%\n` : "") +
    (data.disciplineGrade ? `🛡️ *AI Discipline:* ${data.disciplineGrade}\n\n` : "\n") +
    `Practise Indian stocks & F&O with ₹10L virtual money: ${getAppOrigin()}`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function getLinkedInShareUrl(): string {
  const url = getAppOrigin();
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}
