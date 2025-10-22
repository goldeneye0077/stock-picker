import aiosqlite
import os
from pathlib import Path
from loguru import logger

DATABASE_PATH = Path(__file__).parent.parent.parent.parent / "data" / "stock_picker.db"

def get_database():
    """
    Get database connection as async context manager

    Usage:
        async with get_database() as db:
            cursor = await db.execute("SELECT * FROM stocks")
            ...
    """
    return aiosqlite.connect(DATABASE_PATH)

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

        # 实时行情表（保存每只股票的最新行情）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS realtime_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT UNIQUE NOT NULL,
                ts_code TEXT,
                name TEXT,
                pre_close REAL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                vol INTEGER,
                amount REAL,
                num INTEGER,
                ask_volume1 INTEGER,
                bid_volume1 INTEGER,
                change_percent REAL,
                change_amount REAL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        # 历史行情快照表（保存所有历史记录）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS quote_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                pre_close REAL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                vol INTEGER,
                amount REAL,
                num INTEGER,
                change_percent REAL,
                snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        # 每日指标表（技术分析指标）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS daily_basic (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                close REAL,
                turnover_rate REAL,
                turnover_rate_f REAL,
                volume_ratio REAL,
                pe REAL,
                pe_ttm REAL,
                pb REAL,
                ps REAL,
                ps_ttm REAL,
                dv_ratio REAL,
                dv_ttm REAL,
                total_share REAL,
                float_share REAL,
                free_share REAL,
                total_mv REAL,
                circ_mv REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, trade_date)
            )
        """)

        # 创建索引优化查询性能
        await db.execute("CREATE INDEX IF NOT EXISTS idx_realtime_stock_code ON realtime_quotes(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_realtime_updated_at ON realtime_quotes(updated_at)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_history_stock_code ON quote_history(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_history_snapshot_time ON quote_history(snapshot_time)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_history_stock_time ON quote_history(stock_code, snapshot_time)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_basic_stock_code ON daily_basic(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_basic_trade_date ON daily_basic(trade_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_basic_stock_date ON daily_basic(stock_code, trade_date)")

        await db.commit()
        logger.info("Database initialized successfully")