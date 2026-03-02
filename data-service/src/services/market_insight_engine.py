from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

import requests
from loguru import logger

from ..utils.database import get_database


class MarketInsightEngine:
    def __init__(self) -> None:
        self.default_limit = 4

    @staticmethod
    def _now_text() -> str:
        return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%H:%M")

    async def _resolve_trade_date(self, requested_trade_date: str | None = None) -> str | None:
        if requested_trade_date:
            return requested_trade_date

        async with get_database() as db:
            for query in [
                "SELECT MAX(trade_date) AS trade_date FROM sector_moneyflow",
                "SELECT MAX(trade_date) AS trade_date FROM market_moneyflow",
                "SELECT MAX(date) AS trade_date FROM klines",
            ]:
                row = await (await db.execute(query)).fetchone()
                trade_date = str(row["trade_date"] or "").strip() if row else ""
                if trade_date:
                    return trade_date
        return None

    async def _fetch_context(self, trade_date: str) -> dict[str, Any]:
        context: dict[str, Any] = {
            "tradeDate": trade_date,
            "market": {},
            "sectorFlows": [],
            "breadth": {},
            "signals": {},
            "recentDigests": [],
        }

        async with get_database() as db:
            market_row = await (await db.execute(
                """
                SELECT
                    trade_date, close_sh, pct_change_sh, close_sz, pct_change_sz,
                    net_amount, net_amount_rate, buy_elg_amount, buy_lg_amount, buy_md_amount, buy_sm_amount
                FROM market_moneyflow
                WHERE trade_date = ?
                LIMIT 1
                """,
                (trade_date,),
            )).fetchone()
            if market_row:
                context["market"] = {key: market_row[key] for key in market_row.keys()}

            sector_rows = await (await db.execute(
                """
                SELECT
                    name, pct_change, net_amount, net_amount_rate, rank
                FROM sector_moneyflow
                WHERE trade_date = ?
                ORDER BY ABS(COALESCE(net_amount, 0)) DESC
                LIMIT 8
                """,
                (trade_date,),
            )).fetchall()
            context["sectorFlows"] = [
                {key: row[key] for key in row.keys()} for row in sector_rows
            ]

            breadth_row = await (await db.execute(
                """
                SELECT
                    SUM(CASE WHEN close > open THEN 1 ELSE 0 END) AS up_count,
                    SUM(CASE WHEN close < open THEN 1 ELSE 0 END) AS down_count,
                    SUM(CASE WHEN close = open THEN 1 ELSE 0 END) AS flat_count,
                    COUNT(*) AS total_count
                FROM klines
                WHERE date = ?
                """,
                (trade_date,),
            )).fetchone()
            if breadth_row:
                context["breadth"] = {key: breadth_row[key] for key in breadth_row.keys()}

            signal_row = await (await db.execute(
                """
                SELECT
                    COUNT(*) AS signal_count,
                    SUM(CASE WHEN confidence >= 0.7 THEN 1 ELSE 0 END) AS high_confidence_count,
                    AVG(COALESCE(confidence, 0)) AS avg_confidence
                FROM buy_signals
                WHERE date(created_at) = date(?)
                """,
                (trade_date,),
            )).fetchone()
            if signal_row:
                context["signals"] = {key: signal_row[key] for key in signal_row.keys()}

            digest_rows = await (await db.execute(
                """
                SELECT trade_date, source, featured_card_json
                FROM market_insights
                ORDER BY generated_at DESC
                LIMIT 3
                """
            )).fetchall()
            recent_digests = []
            for row in digest_rows:
                featured = {}
                try:
                    featured = json.loads(row["featured_card_json"] or "{}")
                except Exception:
                    featured = {}
                recent_digests.append({
                    "tradeDate": row["trade_date"],
                    "source": row["source"],
                    "featuredTitle": featured.get("title"),
                    "featuredDesc": featured.get("desc"),
                })
            context["recentDigests"] = recent_digests

        return context

    @staticmethod
    def _safe_round(value: Any, digits: int = 2) -> float:
        try:
            return round(float(value), digits)
        except Exception:
            return 0.0

    def _build_fallback_cards(self, context: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        market = context.get("market") or {}
        breadth = context.get("breadth") or {}
        signals = context.get("signals") or {}
        sectors = context.get("sectorFlows") or []
        top_sector = sectors[0] if sectors else {}
        second_sector = sectors[1] if len(sectors) > 1 else {}

        net_amount = self._safe_round(market.get("net_amount"), 2)
        net_rate = self._safe_round(market.get("net_amount_rate"), 2)
        sh_change = self._safe_round(market.get("pct_change_sh"), 2)
        sz_change = self._safe_round(market.get("pct_change_sz"), 2)

        up_count = int(breadth.get("up_count") or 0)
        down_count = int(breadth.get("down_count") or 0)
        total_count = int(breadth.get("total_count") or 0)
        signal_count = int(signals.get("signal_count") or 0)
        high_conf_count = int(signals.get("high_confidence_count") or 0)
        avg_conf = self._safe_round(signals.get("avg_confidence"), 3)

        sector_name = str(top_sector.get("name") or "板块轮动")
        sector_change = self._safe_round(top_sector.get("pct_change"), 2)
        sector_flow = self._safe_round(top_sector.get("net_amount"), 2)

        featured = {
            "key": f"{context['tradeDate']}-featured",
            "category": "盘后总结",
            "title": f"市场净流向 {net_amount:+.2f}，风格偏 {'进攻' if net_amount >= 0 else '防守'}",
            "desc": (
                f"上证/深证涨跌幅分别为 {sh_change:+.2f}% / {sz_change:+.2f}% ，"
                f"主力净额占比 {net_rate:+.2f}% 。当前更适合 {'顺势跟随强势板块' if net_amount >= 0 else '控制仓位等待确认'}。"
            ),
            "time": f"{self._now_text()} 生成",
        }

        cards = [
            {
                "key": f"{context['tradeDate']}-sector-1",
                "category": "板块异动",
                "title": f"{sector_name} 资金热度居前",
                "desc": f"该板块涨跌幅 {sector_change:+.2f}% ，净流向 {sector_flow:+.2f}。短线可关注核心龙头的承接质量。",
                "time": f"{self._now_text()} 更新",
            },
            {
                "key": f"{context['tradeDate']}-breadth",
                "category": "市场宽度",
                "title": "上涨家数与下跌家数对比",
                "desc": f"上涨 {up_count} 家，下跌 {down_count} 家，总样本 {total_count} 家。市场分化程度需结合次日量能确认。",
                "time": f"{self._now_text()} 更新",
            },
            {
                "key": f"{context['tradeDate']}-signals",
                "category": "策略信号",
                "title": f"当日信号 {signal_count} 条，高置信 {high_conf_count} 条",
                "desc": f"平均置信度 {avg_conf:.3f}。建议优先筛选高置信 + 高流动性标的，降低噪声信号影响。",
                "time": f"{self._now_text()} 更新",
            },
        ]

        if second_sector:
            cards.append({
                "key": f"{context['tradeDate']}-sector-2",
                "category": "轮动线索",
                "title": f"{second_sector.get('name') or '次级热点'} 同步活跃",
                "desc": (
                    f"涨跌幅 {self._safe_round(second_sector.get('pct_change'), 2):+.2f}% ，"
                    f"净流向 {self._safe_round(second_sector.get('net_amount'), 2):+.2f}。"
                    "若连续两日活跃，可考虑纳入观察池。"
                ),
                "time": f"{self._now_text()} 更新",
            })

        return featured, cards[: self.default_limit - 1]

    def _build_llm_prompt(self, context: dict[str, Any]) -> str:
        return (
            "你是A股盘后研究员。请根据给定 JSON 上下文生成结构化市场洞察。\n"
            "输出必须是 JSON，格式：\n"
            "{"
            "\"featured\":{\"category\":\"\",\"title\":\"\",\"desc\":\"\",\"time\":\"\"},"
            "\"cards\":[{\"category\":\"\",\"title\":\"\",\"desc\":\"\",\"time\":\"\"}]"
            "}\n"
            "要求：\n"
            "1) 使用中文，避免空话。\n"
            "2) featured 为全局结论；cards 2-3 条，聚焦板块资金、市场宽度、策略信号。\n"
            "3) 每条 desc 不超过90字。\n"
            "上下文如下：\n"
            f"{json.dumps(context, ensure_ascii=False)}"
        )

    async def _call_llm(self, prompt: str) -> dict[str, Any] | None:
        base_url = (os.getenv("LLM_BASE_URL") or "").strip().rstrip("/")
        api_key = (os.getenv("LLM_API_KEY") or "").strip()
        model_name = (os.getenv("LLM_MODEL") or "").strip() or "gpt-4o-mini"

        if not base_url or not api_key:
            return None

        endpoint = f"{base_url}/chat/completions"
        payload = {
            "model": model_name,
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.2")),
            "messages": [
                {"role": "system", "content": "你是严谨的量化研究员，只输出 JSON。"},
                {"role": "user", "content": prompt},
            ],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        def _request() -> dict[str, Any]:
            resp = requests.post(endpoint, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            return resp.json()

        try:
            response_json = await asyncio.to_thread(_request)
            content = (
                response_json.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            if not content:
                return None

            content = content.strip()
            if content.startswith("```"):
                content = content.strip("`")
                content = content.replace("json", "", 1).strip()

            return json.loads(content)
        except Exception as exc:
            logger.warning(f"LLM call failed, fallback to rule-based insights: {exc}")
            return None

    @staticmethod
    def _normalize_cards(
        trade_date: str,
        featured_raw: dict[str, Any] | None,
        cards_raw: list[dict[str, Any]] | None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        featured_raw = featured_raw or {}
        cards_raw = cards_raw or []

        def _normalize_card(card: dict[str, Any], key: str) -> dict[str, Any]:
            return {
                "key": str(card.get("key") or key),
                "category": str(card.get("category") or "市场洞察"),
                "title": str(card.get("title") or "暂无洞察"),
                "desc": str(card.get("desc") or "暂无详细解读"),
                "time": str(card.get("time") or "刚刚更新"),
            }

        featured = _normalize_card(featured_raw, f"{trade_date}-featured")
        cards: list[dict[str, Any]] = []
        for idx, card in enumerate(cards_raw):
            cards.append(_normalize_card(card, f"{trade_date}-card-{idx+1}"))
            if len(cards) >= 3:
                break
        return featured, cards

    async def generate_and_store(self, trade_date: str | None = None, force: bool = False) -> dict[str, Any]:
        resolved_date = await self._resolve_trade_date(trade_date)
        if not resolved_date:
            raise RuntimeError("No available trade date for insight generation")

        if not force:
            existing = await self.get_latest(limit=self.default_limit, trade_date=resolved_date)
            if existing and existing.get("tradeDate") == resolved_date:
                return existing

        context = await self._fetch_context(resolved_date)
        prompt = self._build_llm_prompt(context)
        llm_output = await self._call_llm(prompt)

        source = "heuristic"
        model_name = None
        if llm_output:
            featured, cards = self._normalize_cards(
                resolved_date,
                llm_output.get("featured"),
                llm_output.get("cards"),
            )
            source = "llm"
            model_name = (os.getenv("LLM_MODEL") or "").strip() or "gpt-4o-mini"
        else:
            featured, cards = self._build_fallback_cards(context)

        generated_at_dt = datetime.now(ZoneInfo("Asia/Shanghai"))
        generated_at = generated_at_dt.isoformat()
        async with get_database() as db:
            await db.execute(
                """
                INSERT INTO market_insights
                (trade_date, generated_at, source, model_name, featured_card_json, cards_json, context_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resolved_date,
                    generated_at_dt,
                    source,
                    model_name,
                    json.dumps(featured, ensure_ascii=False),
                    json.dumps(cards, ensure_ascii=False),
                    json.dumps(context, ensure_ascii=False),
                ),
            )
            await db.commit()

        return {
            "tradeDate": resolved_date,
            "generatedAt": generated_at,
            "source": source,
            "featured": featured,
            "cards": cards,
        }

    async def get_latest(self, limit: int = 4, trade_date: str | None = None) -> dict[str, Any] | None:
        limit = max(1, min(int(limit), 10))
        async with get_database() as db:
            if trade_date:
                row = await (await db.execute(
                    """
                    SELECT trade_date, generated_at, source, model_name, featured_card_json, cards_json
                    FROM market_insights
                    WHERE trade_date = ?
                    ORDER BY generated_at DESC
                    LIMIT 1
                    """,
                    (trade_date,),
                )).fetchone()
            else:
                row = await (await db.execute(
                    """
                    SELECT trade_date, generated_at, source, model_name, featured_card_json, cards_json
                    FROM market_insights
                    ORDER BY generated_at DESC
                    LIMIT 1
                    """
                )).fetchone()

        if not row:
            return None

        try:
            featured = json.loads(row["featured_card_json"] or "{}")
        except Exception:
            featured = {}
        try:
            cards = json.loads(row["cards_json"] or "[]")
        except Exception:
            cards = []

        _, normalized_cards = self._normalize_cards(str(row["trade_date"]), featured, cards)
        normalized_featured, _ = self._normalize_cards(str(row["trade_date"]), featured, [])

        return {
            "tradeDate": row["trade_date"],
            "generatedAt": row["generated_at"],
            "source": row["source"],
            "modelName": row["model_name"],
            "featured": normalized_featured,
            "cards": normalized_cards[: max(0, limit - 1)],
        }
