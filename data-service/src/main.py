from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from loguru import logger
import os
from pathlib import Path
from dotenv import load_dotenv

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
cors_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX") or r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
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
    port = int(os.getenv("PORT", "8002"))
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
