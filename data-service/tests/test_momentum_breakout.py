import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer


class StubAdvancedSelectionAnalyzer(AdvancedSelectionAnalyzer):
    async def _get_stock_list(self):
        return [
            {
                "stock_code": "000001.SZ",
                "stock_name": "平安银行",
                "exchange": "SZ",
                "industry": "银行",
                "raw_code": "000001",
            }
        ]

    async def analyze_stock(self, stock):
        return {
            "stock_code": stock["stock_code"],
            "stock_name": stock["stock_name"],
            "composite_score": 76.0,
            "momentum_score": 42.0,
            "trend_quality_score": 11.0,
            "fundamental_score": 68.0,
            "quality_score": 66.0,
            "valuation_score": 58.0,
            "growth_score": 64.0,
            "volume_score": 82.0,
            "sentiment_score": 78.0,
            "risk_score": 52.0,
            "trend_slope": 0.85,
            "rsi": 61.0,
            "rsi_prev": 56.0,
            "volatility": 24.0,
            "price_change_20d": 26.0,
            "price_change_60d": 63.0,
            "volume_ratio": 2.3,
            "pe_ttm": 17.8,
            "sector_heat": 56.0,
            "is_price_breakout": 1.0,
            "is_volume_breakout": 1.0,
        }


def test_momentum_breakout_strategy_not_empty() -> None:
    analyzer = StubAdvancedSelectionAnalyzer()
    results = asyncio.run(
        analyzer.run_advanced_selection(
            min_score=60.0,
            max_results=20,
            require_uptrend=True,
            require_hot_sector=True,
            require_breakout=True,
            strategy_id=1,
        )
    )

    assert results
    assert any(r.get("stock_code") == "000001.SZ" for r in results)
