import asyncio
import base64
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils import auth
from src.utils.sql_compat import convert_sqlite_query


class _FakeCursor:
    def __init__(self, row=None):
        self._row = row

    async def fetchone(self):
        return self._row


class _FakeDb:
    def __init__(self, row=None):
        self.row = row
        self.calls = []

    async def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return _FakeCursor(self.row)

    async def commit(self):
        return None


class _FakeDbContext:
    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, exc_type, exc, tb):
        return False


def test_hash_password_defaults_to_backend_compatible_hex_format():
    salt, password_hash = auth.hash_password("Password123!")

    assert re.fullmatch(r"[0-9a-f]{32}", salt)
    assert re.fullmatch(r"[0-9a-f]{64}", password_hash)
    assert auth.verify_password("Password123!", salt, password_hash) is True


def test_verify_password_accepts_legacy_base64_hashes():
    password = "Password123!"
    salt_bytes = b"legacy-salt-1234"
    salt_b64 = base64.b64encode(salt_bytes).decode("utf-8")
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 200_000)
    expected_hash = base64.b64encode(derived).decode("utf-8")

    assert auth.verify_password(password, salt_b64, expected_hash) is True


def test_delete_session_uses_token_hash_only(monkeypatch):
    fake_db = _FakeDb()
    monkeypatch.setattr(auth, "get_database", lambda: _FakeDbContext(fake_db))

    asyncio.run(auth.delete_session("raw-session-token"))

    sql, params = fake_db.calls[0]
    assert "OR token" not in sql
    assert params == (auth.hash_session_token("raw-session-token"),)


def test_find_session_row_queries_hash_only(monkeypatch):
    fake_db = _FakeDb(row={"token": "hashed", "user_id": 1, "expires_at": "2099-01-01T00:00:00+00:00", "username": "admin", "is_admin": 1, "is_active": 1})
    monkeypatch.setattr(auth, "get_database", lambda: _FakeDbContext(fake_db))

    row, source = asyncio.run(auth._find_session_row("hashed-token"))

    assert source == "user_sessions"
    assert row["user_id"] == 1
    sql, params = fake_db.calls[0]
    assert "OR s.token" not in sql
    assert params == ("hashed-token",)


def test_convert_sqlite_query_does_not_corrupt_strftime():
    sql_text, _, _ = convert_sqlite_query("SELECT strftime('%H', created_at) FROM page_views")

    assert sql_text == "SELECT strftime('%H', created_at) FROM page_views"
    assert "::time" not in sql_text
