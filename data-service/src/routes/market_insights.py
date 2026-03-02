from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from loguru import logger

from ..services.market_insight_engine import MarketInsightEngine
from ..utils.auth import require_admin
from ..utils.event_bus import publish_market_event

router = APIRouter()
engine = MarketInsightEngine()


class GenerateInsightRequest(BaseModel):
    trade_date: str | None = None
    force: bool = False
    publish_event: bool = True


async def generate_market_insights_task(
    trade_date: str | None = None,
    force: bool = False,
    publish_event: bool = True,
) -> dict:
    try:
        data = await engine.generate_and_store(trade_date=trade_date, force=force)
    except Exception as exc:
        logger.error(f"Generate market insights failed: {exc}")
        return {"success": False, "message": str(exc)}

    if publish_event:
        await publish_market_event(
            "market_insight_updated",
            {
                "tradeDate": data.get("tradeDate"),
                "generatedAt": data.get("generatedAt"),
                "source": data.get("source"),
            },
        )

    return {"success": True, "data": data}


@router.get("/latest")
async def get_latest_market_insights(
    limit: int = Query(default=4, ge=1, le=10),
    trade_date: str | None = Query(default=None),
    auto_generate: bool = Query(default=False),
):
    data = await engine.get_latest(limit=limit, trade_date=trade_date)
    if not data and auto_generate:
        generated = await generate_market_insights_task(
            trade_date=trade_date,
            force=False,
            publish_event=True,
        )
        if generated.get("success"):
            data = generated.get("data")
        else:
            logger.warning(f"Auto-generate market insights skipped: {generated.get('message')}")

    if not data:
        return {
            "success": True,
            "data": {
                "tradeDate": None,
                "generatedAt": None,
                "source": None,
                "featured": None,
                "cards": [],
            },
        }
    return {"success": True, "data": data}


@router.post("/generate")
async def generate_market_insights(
    request: GenerateInsightRequest,
    _: dict = Depends(require_admin),
):
    result = await generate_market_insights_task(
        trade_date=request.trade_date,
        force=bool(request.force),
        publish_event=bool(request.publish_event),
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message") or "failed")
    return result
