import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src import scheduler
from src.routes import data_collection


def test_collect_daily_klines_with_retry_retries_missing_data(monkeypatch):
    calls = {"fetch": 0, "collect": 0, "sleep": []}

    async def _fake_fetch_stocks_task():
        calls["fetch"] += 1

    async def _fake_collect_trade_date_klines_data(trade_date):
        calls["collect"] += 1
        if calls["collect"] == 1:
            return {
                "success": False,
                "message": f"No K-line data for {trade_date}",
                "stats": {"trade_date": trade_date, "inserted": 0},
            }
        return {
            "success": True,
            "message": "ok",
            "stats": {"trade_date": trade_date, "inserted": 12},
        }

    async def _fake_sleep(seconds):
        calls["sleep"].append(seconds)

    monkeypatch.setattr(data_collection, "fetch_stocks_task", _fake_fetch_stocks_task)
    monkeypatch.setattr(data_collection, "collect_trade_date_klines_data", _fake_collect_trade_date_klines_data)
    monkeypatch.setattr(scheduler.asyncio, "sleep", _fake_sleep)
    monkeypatch.setenv("CLOSE_COLLECT_MAX_ATTEMPTS", "2")
    monkeypatch.setenv("CLOSE_COLLECT_RETRY_INTERVAL_SEC", "120")

    result = asyncio.run(
        scheduler.collect_daily_klines_with_retry(trade_date="2026-03-16", source="test")
    )

    assert result["success"] is True
    assert result["stats"]["inserted"] == 12
    assert result["retry"]["attempt"] == 2
    assert result["retry"]["max_attempts"] == 2
    assert result["retry"]["source"] == "test"
    assert calls["fetch"] == 1
    assert calls["collect"] == 2
    assert calls["sleep"] == [120]


def test_collect_daily_klines_with_retry_stops_on_non_retryable_failure(monkeypatch):
    calls = {"fetch": 0, "collect": 0}

    async def _fake_fetch_stocks_task():
        calls["fetch"] += 1

    async def _fake_collect_trade_date_klines_data(trade_date):
        calls["collect"] += 1
        return {
            "success": False,
            "message": f"Database write failed for {trade_date}",
            "stats": {"trade_date": trade_date, "inserted": 0},
        }

    async def _fake_sleep(_seconds):
        raise AssertionError("sleep should not be called for non-retryable failures")

    monkeypatch.setattr(data_collection, "fetch_stocks_task", _fake_fetch_stocks_task)
    monkeypatch.setattr(data_collection, "collect_trade_date_klines_data", _fake_collect_trade_date_klines_data)
    monkeypatch.setattr(scheduler.asyncio, "sleep", _fake_sleep)
    monkeypatch.setenv("CLOSE_COLLECT_MAX_ATTEMPTS", "5")
    monkeypatch.setenv("CLOSE_COLLECT_RETRY_INTERVAL_SEC", "120")

    result = asyncio.run(
        scheduler.collect_daily_klines_with_retry(trade_date="2026-03-16", source="test")
    )

    assert result["success"] is False
    assert result["retry"]["attempt"] == 1
    assert calls["fetch"] == 1
    assert calls["collect"] == 1
