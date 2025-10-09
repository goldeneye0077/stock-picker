import aiosqlite
import os
from pathlib import Path
from loguru import logger

DATABASE_PATH = Path(__file__).parent.parent.parent.parent / "data" / "stock_picker.db"

async def get_database():
    """Get database connection"""
    return await aiosqlite.connect(DATABASE_PATH)

async def init_database():
    """Initialize database tables"""
    # Ensure data directory exists
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Create tables (same as backend)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS stocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                exchange TEXT NOT NULL,
                industry TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS klines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                amount REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS volume_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                volume_ratio REAL NOT NULL,
                avg_volume_20 INTEGER NOT NULL,
                is_volume_surge BOOLEAN DEFAULT FALSE,
                analysis_result TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS fund_flow (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                main_fund_flow REAL NOT NULL,
                retail_fund_flow REAL NOT NULL,
                institutional_flow REAL NOT NULL,
                large_order_ratio REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS buy_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                signal_type TEXT NOT NULL,
                confidence REAL NOT NULL,
                price REAL NOT NULL,
                volume INTEGER NOT NULL,
                analysis_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        await db.commit()
        logger.info("Database initialized successfully")