from __future__ import annotations

import os
import re
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .sql_compat import convert_sqlite_query

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_engine_url: str | None = None


def resolve_database_url(value: str | None = None) -> str:
    explicit = str(value).strip() if value is not None else ""
    if explicit and explicit.startswith("postgres"):
        return explicit

    env_url = (os.getenv("DATABASE_URL") or "").strip()
    if env_url and env_url.startswith("postgres"):
        return env_url

    timescale_url = (os.getenv("TIMESCALE_URL") or "").strip()
    if timescale_url and timescale_url.startswith("postgres"):
        return timescale_url

    return "postgresql+asyncpg://postgres:postgres@timescaledb:5432/stock_picker"


def _normalize_sqlalchemy_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


def get_session_factory(database_url: str | None = None) -> async_sessionmaker[AsyncSession]:
    global _engine, _session_factory, _engine_url

    resolved = _normalize_sqlalchemy_url(resolve_database_url(database_url))
    if _session_factory is not None and _engine_url == resolved:
        return _session_factory

    _engine_url = resolved
    _engine = create_async_engine(
        resolved,
        pool_size=int(os.getenv("DB_POOL_SIZE", "20")),
        max_overflow=int(os.getenv("DB_POOL_MAX_OVERFLOW", "20")),
        pool_timeout=int(os.getenv("DB_POOL_TIMEOUT_SEC", "30")),
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE_SEC", "1800")),
        future=True,
    )
    _session_factory = async_sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False)
    return _session_factory


class Row(OrderedDict):
    def __getitem__(self, key: Any) -> Any:  # type: ignore[override]
        if isinstance(key, int):
            if key < 0:
                key = len(self) + key
            return list(self.values())[key]
        return super().__getitem__(key)

    def __getattr__(self, item: str) -> Any:
        try:
            return self[item]
        except KeyError as exc:
            raise AttributeError(item) from exc


@dataclass
class Cursor:
    rows: list[Row]
    rowcount: int = 0
    lastrowid: Optional[int] = None

    async def fetchone(self):
        if not self.rows:
            return None
        return self.rows.pop(0)

    async def fetchall(self):
        rows = self.rows[:]
        self.rows.clear()
        return rows


class Connection:
    def __init__(self, session: AsyncSession, database_url: str | None = None):
        self._session = session
        self._database_url = database_url
        self.row_factory = Row

    @staticmethod
    def _is_busy_connection_error(exc: Exception) -> bool:
        return "another operation is in progress" in str(exc).lower()

    async def _reopen_session(self) -> None:
        try:
            await self._session.invalidate()
        except Exception:
            try:
                await self._session.rollback()
            except Exception:
                pass
            try:
                await self._session.close()
            except Exception:
                pass
        self._session = get_session_factory(self._database_url)()

    async def execute(self, sql: str, params: Iterable[Any] | None = None) -> Cursor:
        sql_text, bind_params, skip = convert_sqlite_query(sql, list(params or []))
        if skip:
            return Cursor(rows=[], rowcount=0, lastrowid=None)

        coerced_params = dict(bind_params)
        for match in re.finditer(r"CAST\(\s*:p(\d+)\s+AS\s+DATE\s*\)", sql_text, flags=re.IGNORECASE):
            key = f"p{match.group(1)}"
            value = coerced_params.get(key)
            if isinstance(value, str):
                try:
                    coerced_params[key] = date.fromisoformat(value[:10])
                except ValueError:
                    pass
        for match in re.finditer(r":p(\d+)\s*\)?\s*::\s*date\b", sql_text, flags=re.IGNORECASE):
            key = f"p{match.group(1)}"
            value = coerced_params.get(key)
            if isinstance(value, str):
                try:
                    coerced_params[key] = date.fromisoformat(value[:10])
                except ValueError:
                    pass

        try:
            result = await self._session.execute(text(sql_text), coerced_params)
        except Exception as exc:  # pragma: no cover - diagnostics for SQL translation failures
            if self._is_busy_connection_error(exc):
                await self._reopen_session()
                try:
                    result = await self._session.execute(text(sql_text), coerced_params)
                except Exception as retry_exc:
                    raise RuntimeError(f"PG compat execute failed: {retry_exc}\nSQL:\n{sql_text}") from retry_exc
            else:
                raise RuntimeError(f"PG compat execute failed: {exc}\nSQL:\n{sql_text}") from exc
        rows: list[Row] = []
        if result.returns_rows:
            rows = [Row(mapping) for mapping in result.mappings().all()]

        rowcount = int(result.rowcount or (len(rows) if rows else 0))
        lastrowid: Optional[int] = None
        if sql_text.lstrip().upper().startswith("INSERT"):
            try:
                last_id_result = await self._session.execute(text("SELECT LASTVAL() AS id"))
                scalar = last_id_result.scalar_one_or_none()
                if scalar is not None:
                    lastrowid = int(scalar)
            except Exception:
                lastrowid = None

        return Cursor(rows=rows, rowcount=rowcount, lastrowid=lastrowid)

    async def executemany(self, sql: str, seq_of_params: Iterable[Iterable[Any]]) -> None:
        for params in seq_of_params:
            await self.execute(sql, params)

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()

    async def close(self) -> None:
        try:
            await self._session.commit()
        except Exception:
            await self._session.rollback()
        await self._session.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, _tb):
        if exc_type is None:
            await self._session.commit()
        else:
            await self._session.rollback()
        await self._session.close()


class _ConnectFactory:
    def __init__(self, database_url: str | None = None):
        self._database_url = database_url
        self._connection: Connection | None = None

    async def _open(self) -> Connection:
        session = get_session_factory(self._database_url)()
        return Connection(session, database_url=self._database_url)

    def __await__(self):
        return self._open().__await__()

    async def __aenter__(self):
        self._connection = await self._open()
        return self._connection

    async def __aexit__(self, exc_type, exc, tb):
        if self._connection is None:
            return
        await self._connection.__aexit__(exc_type, exc, tb)


def connect(database_url: str | None = None):
    return _ConnectFactory(database_url=database_url)
