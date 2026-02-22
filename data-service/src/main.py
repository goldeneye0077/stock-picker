from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import uvicorn
from loguru import logger
import os
import time
from pathlib import Path
from dotenv import load_dotenv
import asyncio

try:
    from .data_sources.tushare_client import TushareClient
    from .data_sources.akshare_client import AKShareClient
    from .analyzers.volume.volume_analyzer import VolumeAnalyzer
    from .analyzers.funds.fund_flow_analyzer import FundFlowAnalyzer
    from .analyzers.technical import IndicatorCalculator, TrendAnalyzer, PatternRecognizer
    from .models.predictor import BuySignalPredictor
    from .utils.database import init_database
    from .routes import (
        stocks,
        analysis,
        signals,
        data_collection,
        quotes,
        technical,
        fundamental,
        smart_selection,
        advanced_selection,
        simple_selection,
        auth,
        user_management,
        analytics,
        favorites,
    )
    from .scheduler import start_scheduler, stop_scheduler, get_scheduler_status
except ImportError:
    from data_sources.tushare_client import TushareClient
    from data_sources.akshare_client import AKShareClient
    from analyzers.volume.volume_analyzer import VolumeAnalyzer
    from analyzers.funds.fund_flow_analyzer import FundFlowAnalyzer
    from analyzers.technical import IndicatorCalculator, TrendAnalyzer, PatternRecognizer
    from models.predictor import BuySignalPredictor
    from utils.database import init_database
    from routes import (
        stocks,
        analysis,
        signals,
        data_collection,
        quotes,
        technical,
        fundamental,
        smart_selection,
        advanced_selection,
        simple_selection,
        auth,
        user_management,
        analytics,
        favorites,
    )
    from scheduler import start_scheduler, stop_scheduler, get_scheduler_status

# Load .env file from data-service directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

def parse_cors_origins(value: str | None) -> list[str]:
    if not value:
        return []
    origins = []
    for part in value.split(","):
        origin = part.strip()
        if origin:
            origins.append(origin)
    return origins


def is_production_environment() -> bool:
    return (os.getenv("ENV") or os.getenv("NODE_ENV") or "").strip().lower() == "production"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Stock Picker Data Service...")

    # Initialize database
    await init_database()
    logger.info("Database initialized")

    # Initialize data sources
    tushare_client = TushareClient()
    akshare_client = AKShareClient()
    app.state.tushare_client = tushare_client
    app.state.akshare_client = akshare_client

    # Initialize analyzers
    app.state.volume_analyzer = VolumeAnalyzer()
    app.state.fund_analyzer = FundFlowAnalyzer()
    app.state.predictor = BuySignalPredictor()

    # Initialize technical analyzers
    app.state.indicator_calculator = IndicatorCalculator()
    app.state.trend_analyzer = TrendAnalyzer()
    app.state.pattern_recognizer = PatternRecognizer()

    # Start scheduler for automatic data collection
    start_scheduler()

    auto_collect = os.getenv("AUTO_COLLECT_ON_STARTUP", "1").strip().lower() in {"1", "true", "yes", "y", "on"}
    if auto_collect:
        try:
            from .utils.database import get_database
        except ImportError:
            from utils.database import get_database
        try:
            async with get_database() as db:
                cursor = await db.execute("SELECT COUNT(*) AS cnt FROM klines")
                row = await cursor.fetchone()
                kline_count = int((row["cnt"] if row else 0) or 0)
        except Exception as e:
            logger.warning(f"Failed to check klines count: {e}")
            kline_count = 0

        if kline_count == 0 and getattr(tushare_client, "pro", None) is not None:
            try:
                from .routes.data_collection import batch_collect_7days_task, fetch_stocks_task
            except ImportError:
                from routes.data_collection import batch_collect_7days_task, fetch_stocks_task
            app.state.bootstrap_task = asyncio.create_task(fetch_stocks_task())
            app.state.bootstrap_kline_task = asyncio.create_task(batch_collect_7days_task(True))

    logger.info("Data service started successfully")

    yield

    # Shutdown
    logger.info("Shutting down data service...")
    stop_scheduler()

app = FastAPI(
    title="Stock Picker Data Service",
    description="Data processing and analysis service for stock picker application",
    version="1.0.0",
    lifespan=lifespan
)

# 配置 CORS - 允许所有 localhost 端口
cors_allow_origins = parse_cors_origins(os.getenv("CORS_ALLOW_ORIGINS")) or []
cors_origin_regex = (os.getenv("CORS_ALLOW_ORIGIN_REGEX") or "").strip() or None

if not cors_allow_origins and not cors_origin_regex and not is_production_environment():
    cors_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

if not cors_allow_origins and not cors_origin_regex and is_production_environment():
    logger.warning("CORS_ALLOW_ORIGINS is empty in production; browser cross-origin requests will be blocked")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600
)

# Include routes
app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
app.include_router(data_collection.router, prefix="/api/data", tags=["data-collection"])
app.include_router(quotes.router, prefix="/api/quotes", tags=["quotes"])
app.include_router(technical.router, prefix="/api/technical", tags=["technical"])
app.include_router(fundamental.router, prefix="/api/fundamental", tags=["fundamental"])
app.include_router(smart_selection.router, prefix="/api/smart-selection", tags=["smart-selection"])
app.include_router(advanced_selection.router, prefix="/api/advanced-selection", tags=["advanced-selection"])
app.include_router(simple_selection.router, prefix="/api/simple-selection", tags=["simple-selection"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(user_management.router, prefix="/api/admin", tags=["user-management"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(favorites.router, prefix="/api/favorites", tags=["favorites"])

# ==================== API 调用统计中间件 ====================

class APITrackingMiddleware(BaseHTTPMiddleware):
    """
    自动记录所有 /api/* 请求的耗时与状态码到 api_calls 表
    排除 analytics 相关端点避免递归
    """
    async def dispatch(self, request: Request, call_next):
        # 只追踪 /api/ 路径，排除 analytics 端点自身
        path = request.url.path
        if not path.startswith("/api/") or path.startswith("/api/analytics/"):
            return await call_next(request)

        start_time = time.time()
        response = await call_next(request)
        elapsed_ms = int((time.time() - start_time) * 1000)

        # 异步记录到数据库（fire-and-forget）
        try:
            from .utils.database import get_database
        except ImportError:
            from utils.database import get_database

        # 获取用户 ID（如果有）
        user_id = None
        try:
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
                if token:
                    try:
                        from .utils.auth import hash_session_token
                    except ImportError:
                        from utils.auth import hash_session_token
                    token_hash = hash_session_token(token)
                    async with get_database() as db:
                        cursor = await db.execute(
                            "SELECT user_id FROM user_sessions WHERE token = ? OR token = ? LIMIT 1",
                            (token_hash, token)
                        )
                        row = await cursor.fetchone()
                        if row:
                            user_id = row["user_id"]
        except Exception:
            pass

        # 记录 API 调用
        try:
            async with get_database() as db:
                await db.execute(
                    """
                    INSERT INTO api_calls (endpoint, method, user_id, status_code, response_time_ms)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (path, request.method, user_id, response.status_code, elapsed_ms)
                )
                await db.commit()
        except Exception as e:
            logger.warning(f"Failed to record API call: {e}")

        return response


# 注册中间件
app.add_middleware(APITrackingMiddleware)


@app.get("/")
async def root():
    return {
        "message": "Stock Picker Data Service",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "data-service"
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
