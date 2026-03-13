from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Iterable

from loguru import logger

from ..models.predictor import BuySignalPredictor
from ..utils.database import get_database


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def _env_int(name: str, default: int, minimum: int = 0, maximum: int = 10_000) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(minimum, min(default, maximum))
    try:
        value = int(raw)
    except Exception:
        value = default
    return max(minimum, min(value, maximum))


def _to_float(value: object, default: float = 0.0) -> float:
    try:
        numeric = float(value)  # type: ignore[arg-type]
        if numeric != numeric:  # NaN
            return default
        return numeric
    except Exception:
        return default


def _normalize_trade_date(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if "-" in text:
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            pass
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) >= 8:
        try:
            return datetime.strptime(digits[:8], "%Y%m%d").strftime("%Y-%m-%d")
        except Exception:
            return None
    return None


async def _resolve_target_trade_date(trade_date: str | None) -> str | None:
    normalized = _normalize_trade_date(trade_date)
    if normalized:
        return normalized

    async with get_database() as db:
        cursor = await db.execute("SELECT MAX(date) AS d FROM klines")
        row = await cursor.fetchone()
        if not row:
            return None
        latest = row["d"] if "d" in row else row[0]
        return _normalize_trade_date(str(latest) if latest else None)


async def _load_feature_rows(trade_date: str) -> list[dict]:
    async with get_database() as db:
        cursor = await db.execute(
            """
            WITH prev_day AS (
                SELECT stock_code, MAX(date) AS prev_date
                FROM klines
                WHERE date < ?
                GROUP BY stock_code
            ),
            prev_close AS (
                SELECT p.stock_code, k.close AS prev_close
                FROM prev_day p
                JOIN klines k ON k.stock_code = p.stock_code AND k.date = p.prev_date
            ),
            avg_volume AS (
                SELECT stock_code, AVG(volume) AS avg_volume_20
                FROM klines
                WHERE date < ?
                GROUP BY stock_code
            )
            SELECT
                k.stock_code,
                k.close,
                k.volume,
                COALESCE(
                    db.volume_ratio,
                    CASE
                        WHEN av.avg_volume_20 > 0 THEN CAST(k.volume AS REAL) / av.avg_volume_20
                        ELSE 1
                    END
                ) AS volume_ratio,
                CASE
                    WHEN pc.prev_close > 0 THEN ((k.close - pc.prev_close) / pc.prev_close) * 100.0
                    ELSE 0
                END AS price_change,
                COALESCE(ff.main_fund_flow, 0) AS main_fund_flow
            FROM klines k
            LEFT JOIN prev_close pc ON pc.stock_code = k.stock_code
            LEFT JOIN avg_volume av ON av.stock_code = k.stock_code
            LEFT JOIN daily_basic db ON db.stock_code = k.stock_code AND db.trade_date = k.date
            LEFT JOIN fund_flow ff ON ff.stock_code = k.stock_code AND ff.date = k.date
            WHERE k.date = ?
            """,
            (trade_date, trade_date, trade_date),
        )
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


def _build_created_at(trade_date: str) -> datetime:
    # Keep a deterministic timestamp for idempotent daily regeneration.
    return datetime.strptime(f"{trade_date} 15:10:00", "%Y-%m-%d %H:%M:%S")


async def generate_daily_buy_signals(
    trade_date: str | None = None,
    predictor: BuySignalPredictor | None = None,
    sync_timescale: bool = True,
) -> dict:
    """
    Generate real daily buy signals from collected market data and store into buy_signals.
    """
    target_trade_date = await _resolve_target_trade_date(trade_date)
    if not target_trade_date:
        return {
            "success": False,
            "message": "No kline trade date available for signal generation",
            "tradeDate": None,
            "featureRows": 0,
            "candidateCount": 0,
            "inserted": 0,
        }

    min_confidence = _env_float("SIGNAL_MIN_CONFIDENCE", 0.45)
    min_price_change = _env_float("SIGNAL_MIN_PRICE_CHANGE", 0.5)
    min_volume_ratio = _env_float("SIGNAL_MIN_VOLUME_RATIO", 1.2)
    min_main_fund_flow = _env_float("SIGNAL_MIN_MAIN_FUND_FLOW", 0.0)
    max_signals = _env_int("SIGNAL_MAX_COUNT", 200, minimum=1, maximum=2000)

    model = predictor or BuySignalPredictor()
    feature_rows = await _load_feature_rows(target_trade_date)
    if not feature_rows:
        return {
            "success": False,
            "message": f"No feature rows available for trade date {target_trade_date}",
            "tradeDate": target_trade_date,
            "featureRows": 0,
            "candidateCount": 0,
            "inserted": 0,
        }

    candidates: list[dict] = []
    for row in feature_rows:
        stock_code = str(row.get("stock_code") or "").strip()
        if not stock_code:
            continue

        volume_ratio = _to_float(row.get("volume_ratio"), 1.0)
        price_change = _to_float(row.get("price_change"), 0.0)
        main_fund_flow = _to_float(row.get("main_fund_flow"), 0.0)
        close_price = _to_float(row.get("close"), 0.0)
        volume = int(_to_float(row.get("volume"), 0.0))

        # Keep only meaningful moves to avoid flooding the signal table.
        if (
            volume_ratio < min_volume_ratio
            and price_change < min_price_change
            and main_fund_flow < min_main_fund_flow
        ):
            continue

        prediction = await model.predict_buy_signal(
            stock_code=stock_code,
            features={
                "volume_ratio": volume_ratio,
                "price_change": price_change,
                "main_fund_flow": main_fund_flow,
            },
        )

        if prediction.get("error"):
            continue

        confidence = _to_float(prediction.get("confidence"), 0.0)
        if confidence < min_confidence:
            continue

        signal_type = str(prediction.get("signal_type") or "buy").strip() or "buy"
        candidates.append(
            {
                "stock_code": stock_code,
                "signal_type": signal_type,
                "confidence": confidence,
                "price": close_price,
                "volume": max(volume, 0),
                "analysis_data": {
                    "generator": "daily_signal_v1",
                    "trade_date": target_trade_date,
                    "features": {
                        "volume_ratio": round(volume_ratio, 6),
                        "price_change": round(price_change, 6),
                        "main_fund_flow": round(main_fund_flow, 6),
                    },
                    "scores": {
                        "volume_score": _to_float(prediction.get("volume_score")),
                        "price_score": _to_float(prediction.get("price_score")),
                        "fund_score": _to_float(prediction.get("fund_score")),
                    },
                    "recommendation": str(prediction.get("recommendation") or ""),
                },
            }
        )

    candidates.sort(
        key=lambda item: (
            item["confidence"],
            item["analysis_data"]["features"]["volume_ratio"],
            item["analysis_data"]["features"]["main_fund_flow"],
        ),
        reverse=True,
    )

    selected = candidates[:max_signals]
    created_at = _build_created_at(target_trade_date)

    async with get_database() as db:
        await db.execute(
            """
            DELETE FROM buy_signals
            WHERE CAST(created_at AS DATE) = CAST(? AS DATE)
            """,
            (target_trade_date,),
        )

        for item in selected:
            await db.execute(
                """
                INSERT INTO buy_signals
                (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["stock_code"],
                    item["signal_type"],
                    float(item["confidence"]),
                    float(item["price"]),
                    int(item["volume"]),
                    json.dumps(item["analysis_data"], ensure_ascii=False),
                    created_at,
                ),
            )
        await db.commit()

    sync_stats: dict = {"enabled": False, "synced": False}
    if sync_timescale:
        try:
            from ..utils.timescale_bridge import sync_recent_to_timescale

            sync_window_days = _env_int("SIGNAL_TIMESCALE_SYNC_DAYS", 45, minimum=1, maximum=365)
            sync_stats = await sync_recent_to_timescale(days=sync_window_days)
        except Exception as exc:
            logger.warning(f"Signal generation finished but Timescale sync failed: {exc}")

    logger.info(
        "Daily signal generation finished: "
        f"trade_date={target_trade_date}, feature_rows={len(feature_rows)}, "
        f"candidates={len(candidates)}, inserted={len(selected)}"
    )

    return {
        "success": True,
        "message": f"Generated {len(selected)} daily buy signals",
        "tradeDate": target_trade_date,
        "featureRows": len(feature_rows),
        "candidateCount": len(candidates),
        "inserted": len(selected),
        "createdAt": created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "timescaleSync": sync_stats,
    }


async def generate_buy_signals_for_trade_dates(
    trade_dates: Iterable[str],
    predictor: BuySignalPredictor | None = None,
) -> dict:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in trade_dates:
        date_text = _normalize_trade_date(str(item))
        if not date_text or date_text in seen:
            continue
        normalized.append(date_text)
        seen.add(date_text)

    normalized.sort()
    if not normalized:
        return {
            "success": False,
            "message": "No valid trade dates provided",
            "tradeDates": [],
            "generatedDays": 0,
            "inserted": 0,
        }

    model = predictor or BuySignalPredictor()
    generated_days = 0
    inserted = 0
    candidates = 0
    details: list[dict] = []

    for trade_date in normalized:
        result = await generate_daily_buy_signals(
            trade_date=trade_date,
            predictor=model,
            sync_timescale=False,
        )
        details.append(result)
        if result.get("success"):
            generated_days += 1
            inserted += int(result.get("inserted") or 0)
            candidates += int(result.get("candidateCount") or 0)

    return {
        "success": generated_days > 0,
        "tradeDates": normalized,
        "generatedDays": generated_days,
        "inserted": inserted,
        "candidateCount": candidates,
        "details": details,
    }
