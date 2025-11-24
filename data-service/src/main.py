from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from loguru import logger
import os
from pathlib import Path
from dotenv import load_dotenv

from .data_sources.tushare_client import TushareClient
from .analyzers.volume.volume_analyzer import VolumeAnalyzer
from .analyzers.funds.fund_flow_analyzer import FundFlowAnalyzer
from .models.predictor import BuySignalPredictor
from .utils.database import init_database
from .routes import stocks, analysis, signals, data_collection, quotes
from .scheduler import start_scheduler, stop_scheduler, get_scheduler_status

# Load .env file from data-service directory
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Stock Picker Data Service...")

    # Initialize database
    await init_database()
    logger.info("Database initialized")

    # Initialize data sources
    tushare_client = TushareClient()
    app.state.tushare_client = tushare_client

    # Initialize analyzers
    app.state.volume_analyzer = VolumeAnalyzer()
    app.state.fund_analyzer = FundFlowAnalyzer()
    app.state.predictor = BuySignalPredictor()

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3101",
        "http://127.0.0.1:3101",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3004",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3004",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
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
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )