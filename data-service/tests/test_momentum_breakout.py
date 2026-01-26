import asyncio
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer


def _create_test_db(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "CREATE TABLE stocks (code TEXT PRIMARY KEY, name TEXT, exchange TEXT, industry TEXT)"
        )
        cur.execute(
            "CREATE TABLE klines (stock_code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL)"
        )
        cur.execute(
            "CREATE TABLE fund_flow (stock_code TEXT, date TEXT, main_fund_flow REAL)"
        )
        cur.execute(
            "CREATE TABLE daily_basic (stock_code TEXT, pe REAL, pe_ttm REAL, pb REAL, total_mv REAL, trade_date TEXT)"
        )
        cur.execute(
            "CREATE TABLE financial_indicators (stock_code TEXT, roe REAL, end_date TEXT)"
        )

        cur.execute(
            "INSERT INTO stocks (code, name, exchange, industry) VALUES (?, ?, ?, ?)",
            ("000001", "平安银行", "SZ", "银行"),
        )

        start = date(2025, 1, 1)
        for i in range(60):
            d = start + timedelta(days=i)
            close = 10.0 + i * 0.2
            open_ = close - 0.05
            high = close * 1.01
            low = close * 0.99
            volume = 1000.0
            if i == 59:
                volume = 3000.0
            cur.execute(
                "INSERT INTO klines (stock_code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("000001", d.isoformat(), open_, high, low, close, volume),
            )

        cur.execute(
            "INSERT INTO fund_flow (stock_code, date, main_fund_flow) VALUES (?, ?, ?)",
            ("000001", (start + timedelta(days=59)).isoformat(), 20_000_000.0),
        )
        cur.execute(
            "INSERT INTO daily_basic (stock_code, pe, pe_ttm, pb, total_mv, trade_date) VALUES (?, ?, ?, ?, ?, ?)",
            ("000001", 8.0, 8.0, 1.0, 1000.0, (start + timedelta(days=59)).isoformat()),
        )
        cur.execute(
            "INSERT INTO financial_indicators (stock_code, roe, end_date) VALUES (?, ?, ?)",
            ("000001", 15.0, (start + timedelta(days=59)).isoformat()),
        )

        conn.commit()
    finally:
        conn.close()


def test_momentum_breakout_strategy_not_empty(tmp_path: Path) -> None:
    db_path = tmp_path / "stock_picker.db"
    _create_test_db(db_path)

    analyzer = AdvancedSelectionAnalyzer(db_path=str(db_path))
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
