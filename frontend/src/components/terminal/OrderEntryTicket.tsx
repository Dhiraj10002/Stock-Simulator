"use client";

import { useState, useId, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Sparkles,
  Bot,
  Target,
  Crosshair,
} from "lucide-react";
import { formatPaise } from "@/lib/format";
import { INSTRUMENT_METADATA } from "@/lib/mockData";
import MarketDepth from "./MarketDepth";
import { orderFormSchema } from "@/schemas/order";
import OrderConfirmationModal, {
  OrderConfirmationDetails,
} from "@/components/trading/OrderConfirmationModal";
import type { Wallet, Quote, Position, PreTradeCheckResponse, ApiResponse } from "@/types";

type OrderEntryTicketProps = {
  symbol: string;
  quote: Quote | null;
  wallet: Wallet | null;
  positions?: Position[];
  onOrderPlaced: (gtt?: {
    targetPriceRupees?: number;
    stopLossPriceRupees?: number;
    side: "BUY" | "SELL";
    product: "DELIVERY" | "INTRADAY" | "FNO";
    quantity: number;
    symbol: string;
    entryPriceRupees: number;
  }) => void;
  onRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  onToast: (title: string, message?: string, type?: "success" | "error" | "info") => void;
  prefill?: {
    side?: "BUY" | "SELL";
    product?: "DELIVERY" | "INTRADAY" | "FNO";
    type?: "MARKET" | "LIMIT" | "SL" | "SL-M";
    quantity?: number;
    priceRupees?: number;
  } | null;
  onPriceLevelsChange?: (targetRupees: number | null, stopLossRupees: number | null) => void;
};

const KNOWN_FNO_LOTS: Record<string, number> = {
  NIFTY: 25,
  BANKNIFTY: 15,
  RELIANCE: 250,
  TCS: 225,
  INFY: 400,
  HDFCBANK: 550,
  TATAMOTORS: 575,
  SBIN: 750,
};

function inferFnoLotSize(sym: string): number {
  const upper = sym.toUpperCase();
  for (const [underlying, lot] of Object.entries(KNOWN_FNO_LOTS)) {
    if (upper.startsWith(underlying)) {
      return lot;
    }
  }
  return 1;
}

export default function OrderEntryTicket({
  symbol,
  quote,
  wallet,
  positions = [],
  onOrderPlaced,
  onRequest,
  onToast,
  prefill,
  onPriceLevelsChange,
}: OrderEntryTicketProps) {
  const meta = INSTRUMENT_METADATA[symbol] ?? {
    basePricePaise: 250000,
  };

  const defaultPriceRupees = (quote?.price_paise ?? meta.basePricePaise) / 100;

  const isFnoSymbol =
    symbol.endsWith("CE") ||
    symbol.endsWith("PE") ||
    symbol.endsWith("FUT") ||
    symbol.includes("CE") ||
    symbol.includes("PE") ||
    symbol === "NIFTY" ||
    symbol === "BANKNIFTY";

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY" | "FNO">(() =>
    isFnoSymbol ? "FNO" : "DELIVERY"
  );
  const [variety, setVariety] = useState<"REGULAR" | "COVER" | "BRACKET">("REGULAR");
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [targetRupees, setTargetRupees] = useState<number>(() =>
    Number((defaultPriceRupees * 1.02).toFixed(2))
  );
  const [stopLossRupees, setStopLossRupees] = useState<number>(() =>
    Number((defaultPriceRupees * 0.99).toFixed(2))
  );

  const [lotSize, setLotSize] = useState<number>(() => inferFnoLotSize(symbol));
  const [type, setType] = useState<"MARKET" | "LIMIT" | "SL" | "SL-M">("MARKET");
  const [quantity, setQuantity] = useState<number>(() => {
    const lot = inferFnoLotSize(symbol);
    return isFnoSymbol && lot > 1 ? lot : 1;
  });
  const [limitRupees, setLimitRupees] = useState<number>(defaultPriceRupees);
  const [triggerRupees, setTriggerRupees] = useState<number>(defaultPriceRupees);
  const [submitting, setSubmitting] = useState(false);

  // Sync Price Levels to Chart
  useEffect(() => {
    if (onPriceLevelsChange) {
      const isTargetActive = (variety === "BRACKET" || targetEnabled) && targetRupees > 0;
      const isSLActive =
        (variety === "COVER" || variety === "BRACKET" || stopLossEnabled) && stopLossRupees > 0;
      onPriceLevelsChange(
        isTargetActive ? targetRupees : null,
        isSLActive ? stopLossRupees : null
      );
    }
  }, [variety, targetEnabled, targetRupees, stopLossEnabled, stopLossRupees, onPriceLevelsChange]);

  // Dynamically query instrument master to resolve authoritative lot size asynchronously
  useEffect(() => {
    let isMounted = true;

    if (product === "FNO" || isFnoSymbol) {
      onRequest<ApiResponse<Array<{ symbol: string; lot_size: number }>>>(
        `/stocks?q=${encodeURIComponent(symbol)}`
      )
        .then((res) => {
          if (!isMounted) return;
          if (res?.data && res.data.length > 0) {
            const match = res.data.find((d) => d.symbol === symbol) || res.data[0];
            if (match && match.lot_size > 0) {
              setLotSize(match.lot_size);
              setQuantity((q) => {
                if (q < match.lot_size || q % match.lot_size !== 0) {
                  return match.lot_size;
                }
                return q;
              });
            }
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [symbol, product, isFnoSymbol, onRequest]);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmationDetails, setConfirmationDetails] = useState<OrderConfirmationDetails | null>(null);

  const [preTradeRisk, setPreTradeRisk] = useState<PreTradeCheckResponse | null>(null);
  const [checkingRisk, setCheckingRisk] = useState(false);

  // Synchronize prefill prop during render (avoids cascading render warnings)
  const [prevPrefill, setPrevPrefill] = useState(prefill);
  if (prevPrefill !== prefill && prefill) {
    setPrevPrefill(prefill);
    if (prefill.side) setSide(prefill.side);
    if (prefill.product) setProduct(prefill.product);
    if (prefill.type) setType(prefill.type);
    if (prefill.quantity) setQuantity(prefill.quantity);
    if (prefill.priceRupees) {
      setLimitRupees(prefill.priceRupees);
      setTriggerRupees(prefill.priceRupees);
    }
  }

  // Invalidate preTradeRisk when trade parameters change
  const [prevRiskParams, setPrevRiskParams] = useState({ symbol, quantity, side, product, type });
  if (
    prevRiskParams.symbol !== symbol ||
    prevRiskParams.quantity !== quantity ||
    prevRiskParams.side !== side ||
    prevRiskParams.product !== product ||
    prevRiskParams.type !== type
  ) {
    setPrevRiskParams({ symbol, quantity, side, product, type });
    setPreTradeRisk(null);
  }

  const [prevSymbol, setPrevSymbol] = useState(symbol);
  if (prevSymbol !== symbol) {
    setPrevSymbol(symbol);
    const newPrice = (quote?.price_paise ?? meta.basePricePaise) / 100;
    setLimitRupees(newPrice);
    setTriggerRupees(newPrice);
    const isBuy = side === "BUY";
    setTargetRupees(Number((newPrice * (isBuy ? 1.02 : 0.98)).toFixed(2)));
    setStopLossRupees(Number((newPrice * (isBuy ? 0.99 : 1.01)).toFixed(2)));
    if (isFnoSymbol) {
      setProduct("FNO");
      const inferred = inferFnoLotSize(symbol);
      if (inferred > 1) {
        setLotSize(inferred);
        setQuantity(inferred);
      }
    } else {
      setLotSize(1);
    }
  }

  const ltpRupees = (quote?.price_paise ?? meta.basePricePaise) / 100;
  const isStopOrder = type === "SL" || type === "SL-M";
  const isLimitOrder = type === "LIMIT" || type === "SL";

  const activePriceRupees =
    type === "LIMIT" || type === "SL"
      ? limitRupees
      : type === "SL-M"
      ? triggerRupees
      : ltpRupees;

  const estimatedTurnoverPaise = Math.round(quantity * activePriceRupees * 100);

  // Slippage simulation for MARKET and SL-M orders with quantity > 50
  const hasSlippage = (type === "MARKET" || type === "SL-M") && quantity > 50;
  const slippageBps = hasSlippage ? Math.min(6, 2 + Math.floor(((quantity - 50) * 4) / 450)) : 0;
  const slippagePercent = (slippageBps * 0.01).toFixed(2);
  const slippageDeltaRupees = (activePriceRupees * (slippageBps / 10000)).toFixed(2);

  // Stop-loss trigger directional check
  const isTriggerInvalid =
    isStopOrder &&
    ((side === "BUY" && triggerRupees < ltpRupees) ||
     (side === "SELL" && triggerRupees > ltpRupees));

  // Circuit limits calculation
  const lowerCircuitRupees = quote?.lower_circuit_paise
    ? quote.lower_circuit_paise / 100
    : Math.round(ltpRupees * 0.9 * 100) / 100;
  const upperCircuitRupees = quote?.upper_circuit_paise
    ? quote.upper_circuit_paise / 100
    : Math.round(ltpRupees * 1.1 * 100) / 100;

  const isLimitCircuitBreached =
    isLimitOrder &&
    (limitRupees < lowerCircuitRupees || limitRupees > upperCircuitRupees);

  // Margin calculation
  // Delivery = 100% turnover
  // Intraday (MIS) = 20% turnover (5x leverage)
  // FNO = 20% turnover
  const requiredMarginPaise =
    product === "INTRADAY"
      ? Math.ceil(estimatedTurnoverPaise / 5)
      : product === "FNO"
      ? Math.ceil(estimatedTurnoverPaise / 5)
      : estimatedTurnoverPaise;

  const availablePaise = wallet?.available_balance_paise ?? 0;
  const cncHolding = (positions ?? []).find(
    (p) => p.symbol === symbol && p.product === "DELIVERY"
  );
  const sharesOwned = cncHolding?.quantity ?? 0;

  const isFno = product === "FNO";
  const effectiveLotSize = isFno && lotSize > 1 ? lotSize : 1;
  const isInvalidFnoQty = isFno && effectiveLotSize > 1 && quantity % effectiveLotSize !== 0;

  const isAffordable =
    side === "SELL" && product === "DELIVERY"
      ? sharesOwned >= quantity
      : requiredMarginPaise <= availablePaise;

  // Percentage allocation shortcut (25%, 50%, 75%, 100%)
  const handleMarginPercent = (pct: number) => {
    if (availablePaise <= 0 || activePriceRupees <= 0) return;
    const targetBudgetPaise = availablePaise * (pct / 100);
    const leverage = product === "INTRADAY" || product === "FNO" ? 5 : 1;
    const marginPerUnitPaise = Math.ceil((activePriceRupees * 100) / leverage);
    const rawQty = Math.max(1, Math.floor(targetBudgetPaise / marginPerUnitPaise));
    if (isFno && effectiveLotSize > 1) {
      const lots = Math.max(1, Math.floor(rawQty / effectiveLotSize));
      setQuantity(lots * effectiveLotSize);
    } else {
      setQuantity(rawQty);
    }
  };

  const handleCheckRisk = async () => {
    setCheckingRisk(true);
    try {
      const pricePaise = Math.round(activePriceRupees * 100);
      const isTargetActive = (variety === "BRACKET" || targetEnabled) && targetRupees > 0;
      const isSLActive =
        (variety === "COVER" || variety === "BRACKET" || stopLossEnabled) && stopLossRupees > 0;

      const res = await onRequest<ApiResponse<PreTradeCheckResponse>>("/ai/pretrade-check", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          product,
          type,
          quantity,
          price_paise: pricePaise > 0 ? pricePaise : meta.basePricePaise,
          stop_loss_paise: isSLActive ? Math.round(stopLossRupees * 100) : 0,
          target_paise: isTargetActive ? Math.round(targetRupees * 100) : 0,
        }),
      });
      if (res.success && res.data) {
        setPreTradeRisk(res.data);
      }
    } catch (err: unknown) {
      onToast("Risk Check Failed", err instanceof Error ? err.message : "Error analyzing order risk", "error");
    } finally {
      setCheckingRisk(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidFnoQty) {
      const snapped = Math.max(1, Math.round(quantity / effectiveLotSize)) * effectiveLotSize;
      onToast(
        "Invalid Lot Size",
        `F&O quantity must be an exact multiple of lot size ${effectiveLotSize}. Click snap or enter a multiple (e.g. ${snapped}).`,
        "error"
      );
      return;
    }
    if (quantity <= 0) {
      onToast("Invalid Quantity", "Quantity must be greater than zero", "error");
      return;
    }

    if (isStopOrder && triggerRupees <= 0) {
      onToast("Invalid Trigger Price", "Trigger price must be greater than zero", "error");
      return;
    }

    if (isLimitOrder && limitRupees <= 0) {
      onToast("Invalid Limit Price", "Limit price must be greater than zero", "error");
      return;
    }

    if (isLimitOrder && isLimitCircuitBreached) {
      onToast(
        "Circuit Limit Exceeded",
        `Limit price (₹${limitRupees.toFixed(2)}) violates daily circuit limits [₹${lowerCircuitRupees.toFixed(2)} - ₹${upperCircuitRupees.toFixed(2)}]`,
        "error"
      );
      return;
    }

    if (isStopOrder && isTriggerInvalid) {
      onToast(
        "Invalid Trigger Price",
        side === "BUY"
          ? `BUY stop trigger (₹${triggerRupees.toFixed(2)}) must be ≥ current price (₹${ltpRupees.toFixed(2)})`
          : `SELL stop trigger (₹${triggerRupees.toFixed(2)}) must be ≤ current price (₹${ltpRupees.toFixed(2)})`,
        "error"
      );
      return;
    }

    if (side === "SELL" && product === "DELIVERY" && quantity > sharesOwned) {
      onToast(
        "Insufficient Holdings",
        sharesOwned === 0
          ? `You don't own any shares of ${symbol} for Delivery sale.`
          : `You only own ${sharesOwned} shares of ${symbol}, cannot sell ${quantity}.`,
        "error"
      );
      return;
    }

    if (side === "BUY" && !isAffordable) {
      onToast(
        "Insufficient Funds",
        `Required margin is ${formatPaise(requiredMarginPaise)}, but available balance is ${formatPaise(availablePaise)}`,
        "error"
      );
      return;
    }

    const isTargetActive = (variety === "BRACKET" || targetEnabled) && targetRupees > 0;
    const isSLActive =
      (variety === "COVER" || variety === "BRACKET" || stopLossEnabled) && stopLossRupees > 0;

    // Zod Schema Validation
    const validation = orderFormSchema.safeParse({
      symbol,
      side,
      product,
      type,
      variety,
      quantity,
      price_rupees: isLimitOrder ? limitRupees : 0,
      trigger_price_rupees: isStopOrder ? triggerRupees : 0,
      target_rupees: isTargetActive ? targetRupees : undefined,
      stop_loss_rupees: isSLActive ? stopLossRupees : undefined,
      targetEnabled: isTargetActive,
      stopLossEnabled: isSLActive,
      lotSize,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || "Invalid order parameters";
      onToast("Validation Error", firstError, "error");
      return;
    }

    if (isTargetActive) {
      if (side === "BUY" && targetRupees <= activePriceRupees) {
        onToast(
          "Invalid Target Price",
          `BUY target price (₹${targetRupees.toFixed(2)}) must be higher than entry price (₹${activePriceRupees.toFixed(2)})`,
          "error"
        );
        return;
      }
      if (side === "SELL" && targetRupees >= activePriceRupees) {
        onToast(
          "Invalid Target Price",
          `SELL target price (₹${targetRupees.toFixed(2)}) must be lower than entry price (₹${activePriceRupees.toFixed(2)})`,
          "error"
        );
        return;
      }
    }

    if (isSLActive) {
      if (side === "BUY" && stopLossRupees >= activePriceRupees) {
        onToast(
          "Invalid Stop-Loss Price",
          `BUY stop-loss price (₹${stopLossRupees.toFixed(2)}) must be lower than entry price (₹${activePriceRupees.toFixed(2)})`,
          "error"
        );
        return;
      }
      if (side === "SELL" && stopLossRupees <= activePriceRupees) {
        onToast(
          "Invalid Stop-Loss Price",
          `SELL stop-loss price (₹${stopLossRupees.toFixed(2)}) must be higher than entry price (₹${activePriceRupees.toFixed(2)})`,
          "error"
        );
        return;
      }
    }

    // Prepare confirmation details and show modal (fat-finger protection)
    setConfirmationDetails({
      symbol,
      side,
      product,
      type,
      variety,
      quantity,
      priceRupees: isLimitOrder ? limitRupees : activePriceRupees,
      triggerPriceRupees: isStopOrder ? triggerRupees : undefined,
      targetRupees: isTargetActive ? targetRupees : undefined,
      stopLossRupees: isSLActive ? stopLossRupees : undefined,
      requiredMarginPaise: requiredMarginPaise,
      availableBalancePaise: availablePaise,
    });
    setConfirmModalOpen(true);
  };

  const handleConfirmExecuteOrder = async () => {
    if (!confirmationDetails) return;

    setSubmitting(true);
    try {
      const pricePaise = isLimitOrder ? Math.round(limitRupees * 100) : 0;
      const triggerPricePaise = isStopOrder ? Math.round(triggerRupees * 100) : 0;
      await onRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          type,
          product,
          quantity,
          price_paise: pricePaise,
          trigger_price_paise: triggerPricePaise,
        }),
      });

      onToast(
        "Order Placed",
        `${side} ${quantity} ${symbol} (${product} - ${type}) submitted successfully`,
        "success"
      );

      setConfirmModalOpen(false);

      const isTargetActive = (variety === "BRACKET" || targetEnabled) && targetRupees > 0;
      const isSLActive =
        (variety === "COVER" || variety === "BRACKET" || stopLossEnabled) && stopLossRupees > 0;

      if (isTargetActive || isSLActive) {
        onOrderPlaced({
          targetPriceRupees: isTargetActive ? targetRupees : undefined,
          stopLossPriceRupees: isSLActive ? stopLossRupees : undefined,
          side,
          product,
          quantity,
          symbol,
          entryPriceRupees: activePriceRupees,
        });
      } else {
        onOrderPlaced();
      }
    } catch (err) {
      onToast(
        "Order Failed",
        err instanceof Error ? err.message : "Failed to place order",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = side === "BUY";
  const qtyInputId = useId();
  const limitInputId = useId();
  const triggerInputId = useId();

  return (
    <div className="w-full lg:w-[320px] xl:w-[350px] flex flex-col bg-slate-950/80 border-l border-slate-800/80 p-4 shrink-0 overflow-y-auto space-y-4">
      {/* Order Side Segmented Switch */}
      <div className="grid grid-cols-2 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
            isBuy
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          BUY
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
            !isBuy
              ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          SELL
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Product Category (CNC / MIS / F&O) */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">
            Product Category
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "DELIVERY", label: "CNC", tip: "Long-only" },
              { id: "INTRADAY", label: "MIS", tip: "5x Margin" },
              { id: "FNO", label: "F&O", tip: "Derivatives" },
            ].map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => setProduct(prod.id as "DELIVERY" | "INTRADAY" | "FNO")}
                className={`flex flex-col items-center py-1.5 px-1 rounded-xl border text-xs font-bold transition-all ${
                  product === prod.id
                    ? isBuy
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : "bg-rose-950/40 border-rose-500/50 text-rose-300"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <span>{prod.label}</span>
                <span className="text-[9px] font-normal text-slate-500">
                  {prod.tip}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Order Variety (Regular vs Cover vs Bracket) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>Order Variety</span>
            <span className="text-[10px] text-cyan-400 font-mono">
              {variety === "BRACKET" ? "Target + SL" : variety === "COVER" ? "Cover SL" : "Standard"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: "REGULAR", label: "Regular", tip: "Normal" },
              { id: "COVER", label: "Cover (CO)", tip: "With SL" },
              { id: "BRACKET", label: "Bracket (BO)", tip: "Tgt + SL" },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  const newVar = v.id as "REGULAR" | "COVER" | "BRACKET";
                  setVariety(newVar);
                  if (newVar === "COVER") {
                    setStopLossEnabled(true);
                    setTargetEnabled(false);
                  } else if (newVar === "BRACKET") {
                    setStopLossEnabled(true);
                    setTargetEnabled(true);
                  }
                }}
                className={`py-1.5 px-1 rounded-xl border text-center transition-all ${
                  variety === v.id
                    ? "bg-slate-800 border-cyan-500/60 text-cyan-300 shadow-sm shadow-cyan-500/10 font-bold"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="text-xs">{v.label}</div>
                <div className="text-[9px] text-slate-500">{v.tip}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Order Type (Market vs Limit vs SL vs SL-M) */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">
            Order Type
          </span>
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: "MARKET", label: "MKT", sub: "Market" },
              { id: "LIMIT", label: "LMT", sub: "Limit" },
              { id: "SL", label: "SL", sub: "Stop Lmt" },
              { id: "SL-M", label: "SL-M", sub: "Stop Mkt" },
            ].map((ord) => (
              <button
                key={ord.id}
                type="button"
                onClick={() => setType(ord.id as "MARKET" | "LIMIT" | "SL" | "SL-M")}
                className={`py-1.5 px-1 rounded-lg border text-xs font-medium text-center transition-all ${
                  type === ord.id
                    ? "bg-slate-800 border-cyan-500/50 text-cyan-300 shadow-sm shadow-cyan-500/10"
                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-bold">{ord.label}</div>
                <div className="text-[9px] text-slate-500 truncate">{ord.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Controls */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <label htmlFor={qtyInputId} className="font-semibold text-slate-300">
                Quantity
              </label>
              {isFno && effectiveLotSize > 1 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 font-mono font-bold">
                  Lot: {effectiveLotSize} ({(quantity / effectiveLotSize).toFixed(0)} Lots)
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {isFno && effectiveLotSize > 1
                ? [1, 2, 5, 10].map((multiplier) => (
                    <button
                      key={multiplier}
                      type="button"
                      onClick={() => setQuantity((q) => q + multiplier * effectiveLotSize)}
                      className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40 text-[10px] text-purple-300 hover:bg-purple-900/60 transition-colors font-mono"
                    >
                      +{multiplier}L
                    </button>
                  ))
                : [1, 5, 25, 100].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setQuantity((q) => q + step)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors font-mono"
                    >
                      +{step}
                    </button>
                  ))}
            </div>
          </div>
          <div
            className={`flex items-center border rounded-xl bg-slate-900/80 overflow-hidden transition-colors ${
              isInvalidFnoQty ? "border-rose-500/70" : "border-slate-800"
            }`}
          >
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(effectiveLotSize, q - effectiveLotSize))}
              className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 transition-colors font-bold"
            >
              -
            </button>
            <input
              id={qtyInputId}
              type="number"
              min={effectiveLotSize}
              step={effectiveLotSize}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full text-center bg-transparent text-sm font-bold text-white focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => q + effectiveLotSize)}
              className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 transition-colors font-bold"
            >
              +
            </button>
          </div>

          {/* Invalid lot size warning helper */}
          {isInvalidFnoQty && (
            <div className="flex items-center justify-between text-[10px] text-rose-300 bg-rose-950/40 border border-rose-900/60 px-2.5 py-1 rounded-lg">
              <span>Must be a multiple of lot size {effectiveLotSize}</span>
              <button
                type="button"
                onClick={() =>
                  setQuantity(
                    Math.max(1, Math.round(quantity / effectiveLotSize)) * effectiveLotSize
                  )
                }
                className="font-bold underline text-cyan-400 hover:text-cyan-300 ml-2 cursor-pointer"
              >
                Snap to {Math.max(1, Math.round(quantity / effectiveLotSize)) * effectiveLotSize}
              </button>
            </div>
          )}

          {/* Margin Allocation Shortcuts */}
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleMarginPercent(pct)}
                className="py-1 text-[10px] font-semibold rounded bg-slate-900/80 border border-slate-800/80 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-all font-mono"
              >
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Trigger Price Input (For SL and SL-M) */}
        {isStopOrder && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={triggerInputId} className="font-semibold text-slate-400">
                Trigger Price (₹)
              </label>
              <span className={`text-[10px] ${isTriggerInvalid ? "text-rose-400 font-semibold" : "text-slate-500"}`}>
                {side === "BUY" ? `Must be ≥ ₹${ltpRupees.toFixed(2)}` : `Must be ≤ ₹${ltpRupees.toFixed(2)}`}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                ₹
              </span>
              <input
                id={triggerInputId}
                type="number"
                step="0.05"
                min="0.05"
                value={triggerRupees}
                onChange={(e) => setTriggerRupees(parseFloat(e.target.value) || 0)}
                className={`w-full pl-8 pr-4 py-1.5 bg-slate-900/80 border rounded-xl text-sm font-bold text-white focus:outline-none ${
                  isTriggerInvalid ? "border-rose-500/70 focus:border-rose-500" : "border-slate-800 focus:border-cyan-500"
                }`}
              />
            </div>
          </div>
        )}

        {/* Limit Price Input (For LIMIT and SL) */}
        {isLimitOrder && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={limitInputId} className="font-semibold text-slate-400">
                Limit Price (₹)
              </label>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-rose-400/90 font-medium">LC: ₹{lowerCircuitRupees.toFixed(2)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-400/90 font-medium">UC: ₹{upperCircuitRupees.toFixed(2)}</span>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                ₹
              </span>
              <input
                id={limitInputId}
                type="number"
                step="0.05"
                min="0.05"
                value={limitRupees}
                onChange={(e) => setLimitRupees(parseFloat(e.target.value) || 0)}
                className={`w-full pl-8 pr-4 py-1.5 bg-slate-900/80 border rounded-xl text-sm font-bold text-white focus:outline-none ${
                  isLimitCircuitBreached
                    ? "border-rose-500/70 focus:border-rose-500"
                    : "border-slate-800 focus:border-cyan-500"
                }`}
              />
            </div>
            {isLimitCircuitBreached && (
              <p className="text-[10px] text-rose-400 font-medium">
                {limitRupees > upperCircuitRupees ? "Exceeds Upper Circuit Limit (+10%)" : "Falls below Lower Circuit Limit (-10%)"}
              </p>
            )}
          </div>
        )}

        {/* Slippage Estimation Warning for Large Market / SL-M Orders */}
        {hasSlippage && (
          <div className="px-2.5 py-1.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px] space-y-0.5">
            <div className="flex justify-between items-center font-semibold">
              <span>Simulated Slippage (Qty &gt; 50)</span>
              <span className="font-mono">~{slippagePercent}%</span>
            </div>
            <div className="flex justify-between text-[10px] text-amber-400/80 font-mono">
              <span>Est. Fill Price:</span>
              <span>
                ₹{(side === "BUY" ? activePriceRupees * (1 + slippageBps / 10000) : activePriceRupees * (1 - slippageBps / 10000)).toFixed(2)} ({side === "BUY" ? "+" : "-"}₹{slippageDeltaRupees})
              </span>
            </div>
          </div>
        )}

        {/* Bracket / Cover / GTT Target & Stop-Loss Desk */}
        {(variety === "BRACKET" || variety === "COVER" || targetEnabled || stopLossEnabled) && (
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-inner">
            <div className="flex items-center justify-between text-[11px] font-semibold border-b border-slate-800/80 pb-1.5">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Bracket Order Trigger Desk
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                OCO Auto Exit
              </span>
            </div>

            {/* Target Input */}
            {(variety === "BRACKET" || targetEnabled) && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    Target (Take Profit)
                  </span>
                  <div className="flex gap-1">
                    {[1, 2, 5, 10].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          const delta = activePriceRupees * (pct / 100);
                          const calculated = isBuy ? activePriceRupees + delta : activePriceRupees - delta;
                          setTargetRupees(Number(calculated.toFixed(2)));
                        }}
                        className="px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-500/30 text-[9px] font-mono font-bold text-emerald-300 hover:bg-emerald-900/60 transition-colors cursor-pointer"
                      >
                        +{pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    value={targetRupees}
                    onChange={(e) => setTargetRupees(parseFloat(e.target.value) || 0)}
                    className="w-full pl-7 pr-3 py-1.5 bg-slate-950/90 border border-slate-800 focus:border-emerald-500 rounded-lg text-xs font-bold text-emerald-400 focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Stop-Loss Input */}
            {(variety === "COVER" || variety === "BRACKET" || stopLossEnabled) && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-rose-400 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Stop-Loss Price
                  </span>
                  <div className="flex gap-1">
                    {[0.5, 1, 2, 5].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          const delta = activePriceRupees * (pct / 100);
                          const calculated = isBuy ? activePriceRupees - delta : activePriceRupees + delta;
                          setStopLossRupees(Number(calculated.toFixed(2)));
                        }}
                        className="px-1.5 py-0.2 rounded bg-rose-950/60 border border-rose-500/30 text-[9px] font-mono font-bold text-rose-300 hover:bg-rose-900/60 transition-colors cursor-pointer"
                      >
                        -{pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500 text-xs font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    value={stopLossRupees}
                    onChange={(e) => setStopLossRupees(parseFloat(e.target.value) || 0)}
                    className="w-full pl-7 pr-3 py-1.5 bg-slate-950/90 border border-slate-800 focus:border-rose-500 rounded-lg text-xs font-bold text-rose-400 focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Live Risk-to-Reward & P&L Projection */}
            {(variety === "BRACKET" || (targetEnabled && stopLossEnabled)) && (
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-1 text-slate-400">
                  <span>R:R</span>
                  <span className="font-bold text-cyan-300 px-1 py-0.2 rounded bg-cyan-950/80 border border-cyan-800/50">
                    1 : {Math.abs(activePriceRupees - stopLossRupees) > 0 ? (Math.abs(targetRupees - activePriceRupees) / Math.abs(activePriceRupees - stopLossRupees)).toFixed(1) : "0"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-medium">
                    +₹{(Math.abs(targetRupees - activePriceRupees) * quantity).toFixed(2)}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-rose-400 font-medium">
                    -₹{(Math.abs(activePriceRupees - stopLossRupees) * quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regular Order Optional Toggles */}
        {variety === "REGULAR" && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5 px-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={targetEnabled}
                onChange={(e) => setTargetEnabled(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
              />
              <span>Attach Target</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={stopLossEnabled}
                onChange={(e) => setStopLossEnabled(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0"
              />
              <span>Attach Stop-Loss</span>
            </label>
          </div>
        )}

        {/* Margin Requirement Summary */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800/60 p-2.5 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Estimated Turnover</span>
            <span className="text-slate-200">
              {formatPaise(estimatedTurnoverPaise)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 flex items-center gap-1">
              Required Margin
              {product === "INTRADAY" && (
                <span className="text-[10px] text-cyan-400 font-semibold">
                  (5x)
                </span>
              )}
            </span>
            <strong
              className={`font-bold ${
                isAffordable ? "text-cyan-400" : "text-rose-400"
              }`}
            >
              {formatPaise(requiredMarginPaise)}
            </strong>
          </div>
          <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Available Balance</span>
            <span className="font-semibold text-slate-300">
              {formatPaise(availablePaise)}
            </span>
          </div>
          {side === "SELL" && product === "DELIVERY" && (
            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800/60">
              <span>Delivery Holdings</span>
              <span
                className={`font-semibold ${
                  sharesOwned >= quantity ? "text-slate-300" : "text-amber-400"
                }`}
              >
                {sharesOwned} shares
              </span>
            </div>
          )}
        </div>

        {/* Pre-Trade AI Risk Check Pill & Assessment */}
        <div className="pt-0.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI Behavioral Risk Check</span>
            </div>

            <button
              type="button"
              onClick={handleCheckRisk}
              disabled={checkingRisk}
              className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 font-semibold text-[10px] flex items-center gap-1 transition-all"
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>{checkingRisk ? "Analyzing…" : "Check Risk"}</span>
            </button>
          </div>

          {preTradeRisk && (
            <div
              className={`p-2.5 rounded-xl border text-[11px] space-y-2 animate-fade-in ${
                preTradeRisk.risk_level === "HIGH_RISK"
                  ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                  : preTradeRisk.risk_level === "MODERATE"
                  ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                  : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  {preTradeRisk.risk_level === "HIGH_RISK" ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>{preTradeRisk.risk_level}</span>
                  {preTradeRisk.risk_score !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-700/60 text-slate-200">
                      Score: {preTradeRisk.risk_score}/100
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span>Margin: {preTradeRisk.margin_impact_pct.toFixed(0)}%</span>
                  {preTradeRisk.risk_reward_ratio !== undefined && preTradeRisk.risk_reward_ratio > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-bold">
                      1:{preTradeRisk.risk_reward_ratio.toFixed(1)} R:R
                    </span>
                  )}
                </div>
              </div>

              {preTradeRisk.warnings.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-300">
                  {preTradeRisk.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              )}

              <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 leading-tight">
                💡 {preTradeRisk.advice}
              </p>

              {/* Actionable Quick Fixes */}
              {(preTradeRisk.warnings.some((w) => w.includes("Missing Stop-Loss")) ||
                preTradeRisk.margin_impact_pct > 50) && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800/40">
                  {preTradeRisk.warnings.some((w) => w.includes("Missing Stop-Loss")) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStopLossEnabled(true);
                        setStopLossRupees(
                          Number(
                            (
                              activePriceRupees * (side === "BUY" ? 0.985 : 1.015)
                            ).toFixed(2)
                          )
                        );
                        onToast(
                          "Stop-Loss Attached",
                          "Attached 1.5% SL guardrail. Re-run risk check to verify score.",
                          "info"
                        );
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-medium text-slate-200 transition-colors"
                    >
                      🛡️ Auto-Set 1.5% SL
                    </button>
                  )}
                  {preTradeRisk.margin_impact_pct > 50 && (
                    <button
                      type="button"
                      onClick={() => {
                        handleMarginPercent(25);
                        onToast(
                          "Position Downsized",
                          "Reduced quantity to safe 25% margin allocation.",
                          "info"
                        );
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-medium text-slate-200 transition-colors"
                    >
                      ⚖️ Resize to 25% Margin
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submission Button */}
        <button
          type="submit"
          disabled={submitting || !isAffordable}
          className={`w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
            isBuy
              ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30 disabled:bg-emerald-950/60 disabled:text-emerald-700/60 disabled:cursor-not-allowed"
              : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30 disabled:bg-rose-950/60 disabled:text-rose-700/60 disabled:cursor-not-allowed"
          }`}
        >
          {submitting ? (
            <span className="animate-pulse">Placing Order…</span>
          ) : side === "SELL" && product === "DELIVERY" && !isAffordable ? (
            <span>
              {sharesOwned === 0
                ? "No CNC Holdings to Sell"
                : `Holding: ${sharesOwned} (Need ${quantity})`}
            </span>
          ) : side === "BUY" && !isAffordable ? (
            <span>Insufficient Balance</span>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Place {side} Order
            </>
          )}
        </button>
      </form>

      {/* Embedded Level 2 Market Depth Widget */}
      <MarketDepth
        symbol={symbol}
        quote={quote}
        onSelectPrice={(price) => {
          setLimitRupees(price);
          setType("LIMIT");
          onToast(
            "Price Loaded",
            `Limit price set to ₹${price.toFixed(2)} from Market Depth`,
            "info"
          );
        }}
      />

      {/* Footer Safeguard Note */}
      <div className="pt-1 text-[10px] text-slate-500 flex items-center gap-1.5 leading-tight">
        <ShieldCheck className="w-3.5 h-3.5 text-cyan-500/60 shrink-0" />
        <span>Pre-trade ledger checks & 15:20 MIS square-off enforced by server.</span>
      </div>

      {/* Institutional Order Confirmation Modal (Fat-Finger Safeguard) */}
      <OrderConfirmationModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmExecuteOrder}
        details={confirmationDetails}
        submitting={submitting}
      />
    </div>
  );
}
