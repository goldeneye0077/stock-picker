import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils import pg_compat


class _FakeMappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows=None, rowcount=0, scalar=None, returns_rows=True):
        self._rows = rows or []
        self.rowcount = rowcount
        self._scalar = scalar
        self.returns_rows = returns_rows

    def mappings(self):
        return _FakeMappings(self._rows)

    def scalar_one_or_none(self):
        return self._scalar


class _BusySession:
    def __init__(self):
        self.invalidate_calls = 0
        self.rollback_calls = 0
        self.close_calls = 0
        self.commit_calls = 0

    async def execute(self, _stmt, _params=None):
        raise RuntimeError("cannot perform operation: another operation is in progress")

    async def invalidate(self):
        self.invalidate_calls += 1

    async def rollback(self):
        self.rollback_calls += 1

    async def close(self):
        self.close_calls += 1

    async def commit(self):
        self.commit_calls += 1


class _HealthySession:
    def __init__(self):
        self.calls = []
        self.invalidate_calls = 0
        self.rollback_calls = 0
        self.close_calls = 0
        self.commit_calls = 0

    async def execute(self, stmt, params=None):
        self.calls.append((str(stmt), params))
        return _FakeResult(rows=[{"value": 1}], rowcount=1)

    async def invalidate(self):
        self.invalidate_calls += 1

    async def rollback(self):
        self.rollback_calls += 1

    async def close(self):
        self.close_calls += 1

    async def commit(self):
        self.commit_calls += 1


def test_pg_compat_retries_once_with_fresh_session_when_connection_is_busy(monkeypatch):
    busy_session = _BusySession()
    healthy_session = _HealthySession()

    def _fake_session_factory(_database_url=None):
        class _Factory:
            def __call__(self):
                return healthy_session

        return _Factory()

    monkeypatch.setattr(pg_compat, "get_session_factory", _fake_session_factory)

    conn = pg_compat.Connection(busy_session, database_url="postgresql+asyncpg://example")
    cursor = asyncio.run(conn.execute("SELECT 1 AS value"))
    row = asyncio.run(cursor.fetchone())

    assert busy_session.invalidate_calls == 1
    assert healthy_session.calls
    assert row["value"] == 1
