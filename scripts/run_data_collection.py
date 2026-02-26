"""One-click data collection script for local development."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT / "data-service"))


async def main() -> None:
    from src.utils.database import init_database
    from src.routes.data_collection import batch_collect_7days_data
    from fill_sector_moneyflow import main as fill_sector_moneyflow_main

    print("=== Init database ===")
    await init_database()
    print("[ok] database initialized")

    print("\n=== Collect last 7 trading days ===")
    print("Includes: stocks, klines, daily basic, quotes, fund flow, market flow")

    result = await batch_collect_7days_data(include_moneyflow=True)

    if result.get("success"):
        print(f"\n[ok] collection succeeded: {result.get('message')}")
        stats = result.get("stats", {}) or {}
        if stats:
            print(f"  stocks: {stats.get('stocks_count', 'N/A')}")
            print(f"  klines: {stats.get('klines_inserted', 'N/A')}")
            print(f"  quotes: {stats.get('quotes_inserted', 'N/A')}")

        print("\n=== Fill sector moneyflow ===")
        fill_exit_code = fill_sector_moneyflow_main(["5"])
        if fill_exit_code != 0:
            print(f"[warn] sector moneyflow fill exited with code {fill_exit_code}")
    else:
        print(f"\n[error] collection failed: {result.get('message')}")
        print(f"  details: {result}")


if __name__ == "__main__":
    asyncio.run(main())
