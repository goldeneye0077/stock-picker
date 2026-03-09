from __future__ import annotations

import re
from typing import Any, Sequence

UPSERT_CONFLICT_COLUMNS: dict[str, list[str]] = {
    "stocks": ["code"],
    "klines": ["stock_code", "date"],
    "volume_analysis": ["stock_code", "date"],
    "fund_flow": ["stock_code", "date"],
    "buy_signals": ["stock_code", "signal_type", "created_at"],
    "advanced_selection_history": ["run_id", "stock_code", "selection_date"],
    "realtime_quotes": ["stock_code"],
    "quote_history": ["id"],
    "daily_basic": ["stock_code", "trade_date"],
    "kpl_concepts": ["trade_date", "ts_code"],
    "kpl_concept_cons": ["trade_date", "ts_code", "stock_code"],
    "ths_indices": ["ts_code"],
    "ths_members": ["ts_code", "stock_code"],
    "technical_indicators": ["stock_code", "date"],
    "trend_analysis": ["stock_code", "date"],
    "pattern_signals": ["stock_code", "date", "pattern_type"],
    "users": ["username"],
    "user_permissions": ["user_id", "path"],
    "user_sessions": ["token"],
    "user_favorites": ["user_id", "stock_code"],
    "market_moneyflow": ["trade_date"],
    "sector_moneyflow": ["trade_date", "name"],
    "collection_config": ["config_key"],
    "super_mainforce_signals": ["stock_code", "signal_date"],
    "market_insights": ["id"],
}


def _split_csv(raw: str) -> list[str]:
    return [item.strip().strip('"') for item in raw.split(",") if item.strip()]


def _rewrite_insert_or_replace(sql: str) -> str:
    match = re.match(
        r"^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([A-Za-z0-9_.\"]+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\s*;?\s*$",
        sql,
        re.IGNORECASE,
    )
    if not match:
        return re.sub(r"INSERT\s+OR\s+REPLACE\s+INTO", "INSERT INTO", sql, flags=re.IGNORECASE)

    table_name_raw, columns_raw, rest_raw = match.group(1), match.group(2), match.group(3)
    table_name = table_name_raw.replace('"', "")
    columns = _split_csv(columns_raw)
    conflict_columns = UPSERT_CONFLICT_COLUMNS.get(table_name, [])
    update_columns = [column for column in columns if column not in conflict_columns]

    if conflict_columns and update_columns:
        update_set = ", ".join(f"{column} = EXCLUDED.{column}" for column in update_columns)
        on_conflict = f"ON CONFLICT ({', '.join(conflict_columns)}) DO UPDATE SET {update_set}"
    elif conflict_columns:
        on_conflict = f"ON CONFLICT ({', '.join(conflict_columns)}) DO NOTHING"
    else:
        on_conflict = "ON CONFLICT DO NOTHING"

    return f"INSERT INTO {table_name_raw} ({columns_raw}) {rest_raw.strip()} {on_conflict}"


def _replace_qmark_placeholders(sql: str) -> tuple[str, int]:
    result: list[str] = []
    index = 0
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False

    i = 0
    length = len(sql)
    while i < length:
        char = sql[i]
        next_char = sql[i + 1] if i + 1 < length else ""

        if in_line_comment:
            result.append(char)
            if char == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            result.append(char)
            if char == "*" and next_char == "/":
                result.append(next_char)
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if not in_single_quote and not in_double_quote:
            if char == "-" and next_char == "-":
                result.append(char)
                result.append(next_char)
                in_line_comment = True
                i += 2
                continue
            if char == "/" and next_char == "*":
                result.append(char)
                result.append(next_char)
                in_block_comment = True
                i += 2
                continue

        if char == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
            result.append(char)
            i += 1
            continue
        if char == '"' and not in_single_quote:
            in_double_quote = not in_double_quote
            result.append(char)
            i += 1
            continue
        if char == "?" and not in_single_quote and not in_double_quote:
            index += 1
            result.append(f":p{index}")
            i += 1
            continue
        result.append(char)
        i += 1

    return "".join(result), index


def _rewrite_sqlite_master(sql: str) -> str:
    return re.sub(
        r"SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*'([^']+)'",
        lambda m: (
            "SELECT table_name AS name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = "
            f"'{m.group(1)}'"
        ),
        sql,
        flags=re.IGNORECASE,
    )


def _rewrite_date_time(sql: str) -> str:
    text = sql
    text = re.sub(
        r"date\(\s*'now'\s*,\s*'-'\s*\|\|\s*:p(\d+)\s*\|\|\s*' days'\s*\)",
        lambda m: f"(CURRENT_DATE - (CAST(:p{m.group(1)} AS INTEGER) * INTERVAL '1 day'))::date",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*([^,]+?)\s*,\s*'-'\s*\|\|\s*:p(\d+)\s*\|\|\s*' days'\s*\)",
        lambda m: (
            f"(({m.group(1)})::date - "
            f"(CAST(:p{m.group(2)} AS INTEGER) * INTERVAL '1 day'))::date"
        ),
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*'now'\s*,\s*:p(\d+)\s*\)",
        lambda m: f"(CURRENT_DATE + CAST(:p{m.group(1)} AS INTERVAL))::date",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*([^,]+?)\s*,\s*:p(\d+)\s*\)",
        lambda m: f"(({m.group(1)})::date + CAST(:p{m.group(2)} AS INTERVAL))::date",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*([^,]+?)\s*,\s*'-(\d+)\s*days'\s*\)",
        lambda m: f"(({m.group(1)})::date - INTERVAL '{m.group(2)} day')::date",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*([^,]+?)\s*,\s*'\+(\d+)\s*days'\s*\)",
        lambda m: f"(({m.group(1)})::date + INTERVAL '{m.group(2)} day')::date",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*([^)]+?)\s*,\s*'\+8 hours'\s*\)",
        lambda m: f"DATE(({m.group(1)}) + INTERVAL '8 hour')",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"date\(\s*'now'\s*,\s*'-(\d+)\s*days'\s*\)",
        lambda m: f"(CURRENT_DATE - INTERVAL '{m.group(1)} day')::date",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"date\(\s*'now'\s*\)", "CURRENT_DATE", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\bdate\(\s*([^)]+?)\s*\)",
        lambda m: f"CAST({m.group(1)} AS DATE)",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"datetime\(\s*'now'\s*,\s*'localtime'\s*\)", "NOW()", text, flags=re.IGNORECASE)
    text = re.sub(r"datetime\(\s*'now'\s*\)", "NOW()", text, flags=re.IGNORECASE)
    text = re.sub(
        r"substr\(\s*([^,]+?)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)",
        lambda m: f"SUBSTRING({m.group(1)} FROM {m.group(2)} FOR {m.group(3)})",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"substr\(\s*([^,]+?)\s*,\s*(\d+)\s*\)",
        lambda m: f"SUBSTRING({m.group(1)} FROM {m.group(2)})",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\btime\(\s*([^)]+?)\s*\)", lambda m: f"(({m.group(1)})::time)", text, flags=re.IGNORECASE)
    text = re.sub(r"is_volume_surge\s*=\s*1", "is_volume_surge = TRUE", text, flags=re.IGNORECASE)
    return text


def _rewrite_schema_syntax(sql: str) -> str:
    text = sql
    text = re.sub(
        r"\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b",
        "BIGSERIAL PRIMARY KEY",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\bAUTOINCREMENT\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bDATETIME\b", "TIMESTAMPTZ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", "INSERT INTO", text, flags=re.IGNORECASE)
    return text


def convert_sqlite_query(sql: str, params: Sequence[Any] | None = None) -> tuple[str, dict[str, Any], bool]:
    normalized_params = list(params or [])
    text = (sql or "").strip()
    if not text:
        return "", {}, True

    if re.match(r"^PRAGMA\b", text, flags=re.IGNORECASE):
        return "SELECT 1", {}, True

    is_insert_or_ignore = bool(re.search(r"\bINSERT\s+OR\s+IGNORE\b", text, flags=re.IGNORECASE))
    text = _rewrite_sqlite_master(text)
    if re.search(r"\bINSERT\s+OR\s+REPLACE\b", text, flags=re.IGNORECASE):
        text = _rewrite_insert_or_replace(text)

    text = _rewrite_schema_syntax(text)
    text, _placeholder_count = _replace_qmark_placeholders(text)
    text = _rewrite_date_time(text)

    if is_insert_or_ignore and "ON CONFLICT" not in text.upper():
        text = f"{text.rstrip(';')} ON CONFLICT DO NOTHING"

    bind_params = {f"p{i + 1}": normalized_params[i] for i in range(len(normalized_params))}
    return text, bind_params, False
