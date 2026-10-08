import asyncio
import websockets
import json
import time
from datetime import datetime, timezone
import statistics

async def measure_feed_latency(sample_count=50):
    uri = "wss://stocksim-api.duckdns.org/ws/market"
    headers = {"Origin": "https://stock-simulator-gules.vercel.app"}
    symbols = ["RELIANCE", "NIFTY", "INFY", "BANKNIFTY", "TATAMOTORS"]
    
    print(f"Connecting to live feed {uri}...")
    latencies = []
    ticks_by_symbol = {}
    
    async with websockets.connect(uri, additional_headers=headers) as ws:
        print(f"Connected! Subscribing to high-frequency instruments: {symbols}")
        await ws.send(json.dumps({"action": "subscribe", "symbols": symbols}))
        
        while len(latencies) < sample_count:
            raw_msg = await ws.recv()
            recv_monotonic = time.perf_counter()
            recv_utc = datetime.now(timezone.utc)
            
            try:
                msg = json.loads(raw_msg)
            except Exception:
                continue
                
            if msg.get("type") != "quote":
                continue
                
            quote = msg.get("quote", {})
            sym = quote.get("symbol")
            updated_at_str = quote.get("updated_at")
            source = quote.get("source")
            price = quote.get("price_paise", 0) / 100
            
            if not updated_at_str or source != "angelone_live":
                continue
                
            try:
                # Parse ISO timestamp
                if updated_at_str.endswith("Z"):
                    updated_at_str = updated_at_str[:-1] + "+00:00"
                updated_at = datetime.fromisoformat(updated_at_str)
                delay_ms = (recv_utc - updated_at).total_seconds() * 1000.0
                
                # Filter out negative drift if clock sync differences occur
                if delay_ms >= 0:
                    latencies.append(delay_ms)
                    ticks_by_symbol[sym] = ticks_by_symbol.get(sym, 0) + 1
                    print(f"[{len(latencies)}/{sample_count}] {sym:<10} | Price: ₹{price:<10.2f} | Latency: {delay_ms:6.2f} ms")
            except Exception as e:
                pass

    if latencies:
        latencies.sort()
        p50 = statistics.median(latencies)
        p90 = latencies[int(len(latencies) * 0.90)]
        p99 = latencies[int(len(latencies) * 0.99)]
        avg = statistics.mean(latencies)
        min_lat = min(latencies)
        max_lat = max(latencies)
        
        print("\n" + "="*60)
        print("          LIVE ANGEL ONE TICK LATENCY BENCHMARK RESULTS")
        print("="*60)
        print(f"Total Ticks Sampled   : {len(latencies)}")
        print(f"Feed Provider         : Angel One WebSocket API (Live)")
        print(f"Pipeline Route        : Angel One -> Worker -> Redis -> Go WS -> Client")
        print(f"Minimum Latency       : {min_lat:.2f} ms")
        print(f"Median (p50) Latency  : {p50:.2f} ms  (Target: < 80 ms)")
        print(f"90th Percentile (p90) : {p90:.2f} ms")
        print(f"99th Percentile (p99) : {p99:.2f} ms")
        print(f"Maximum Latency       : {max_lat:.2f} ms")
        print(f"Average Latency       : {avg:.2f} ms")
        print("="*60)
        return {
            "p50": p50,
            "p90": p90,
            "p99": p99,
            "min": min_lat,
            "max": max_lat,
            "avg": avg,
            "samples": len(latencies),
            "distribution": ticks_by_symbol
        }

if __name__ == "__main__":
    asyncio.run(measure_feed_latency(50))
