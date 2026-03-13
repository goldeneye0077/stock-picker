import asyncio
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.services import signal_generation_service as service


class _FakeCursor:
    async def fetchone(self):
        return None


class _FakeDb:
    def __init__(self):
        self.calls = []

    async def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return _FakeCursor()

    async def commit(self):
        return None


class _FakeDbContext:
    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakePredictor:
    async def predict_buy_signal(self, *, stock_code, features):
        return {
            "signal_type": "买入",
            "confidence": 0.91,
            "volume_score": 85,
            "price_score": 78,
            "fund_score": 66,
            "recommendation": f"{stock_code} looks strong",
        }


def test_generate_daily_buy_signals_uses_datetime_created_at(monkeypatch):
    fake_db = _FakeDb()

    async def _fake_resolve_target_trade_date(_trade_date):
        return "2026-03-11"

    async def _fake_load_feature_rows(_trade_date):
        return [
            {
                "stock_code": "000001",
                "close": 12.34,
                "volume": 123456,
                "volume_ratio": 2.5,
                "price_change": 3.2,
                "main_fund_flow": 1000.0,
            }
        ]

    monkeypatch.setattr(service, "_resolve_target_trade_date", _fake_resolve_target_trade_date)
    monkeypatch.setattr(service, "_load_feature_rows", _fake_load_feature_rows)
    monkeypatch.setattr(service, "get_database", lambda: _FakeDbContext(fake_db))

    result = asyncio.run(
        service.generate_daily_buy_signals(
            trade_date="2026-03-11",
            predictor=_FakePredictor(),
            sync_timescale=False,
        )
    )

    assert result["success"] is True
    assert result["inserted"] == 1
    assert result["createdAt"] == "2026-03-11 15:10:00"

    delete_sql, delete_params = fake_db.calls[0]
    assert "DELETE FROM buy_signals" in delete_sql
    assert delete_params == ("2026-03-11",)

    insert_sql, insert_params = fake_db.calls[1]
    assert "INSERT INTO buy_signals" in insert_sql
    assert isinstance(insert_params[-1], datetime)
    assert insert_params[-1] == datetime(2026, 3, 11, 15, 10, 0)
