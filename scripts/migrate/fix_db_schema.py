import sqlite3

def fix_schema():
    print("正在修复数据库表结构...")
    conn = sqlite3.connect('data/stock_picker.db')
    cursor = conn.cursor()

    # 1. 创建 market_moneyflow 表
    print("创建 market_moneyflow 表...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS market_moneyflow (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trade_date TEXT UNIQUE NOT NULL,
          close_sh REAL,
          pct_change_sh REAL,
          close_sz REAL,
          pct_change_sz REAL,
          net_amount REAL,
          net_amount_rate REAL,
          buy_elg_amount REAL,
          buy_elg_amount_rate REAL,
          buy_lg_amount REAL,
          buy_lg_amount_rate REAL,
          buy_md_amount REAL,
          buy_md_amount_rate REAL,
          buy_sm_amount REAL,
          buy_sm_amount_rate REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. 创建 sector_moneyflow 表
    print("创建 sector_moneyflow 表...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sector_moneyflow (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trade_date TEXT NOT NULL,
          ts_code TEXT,
          name TEXT NOT NULL,
          pct_change REAL,
          close REAL,
          net_amount REAL,
          net_amount_rate REAL,
          buy_elg_amount REAL,
          buy_elg_amount_rate REAL,
          buy_lg_amount REAL,
          buy_lg_amount_rate REAL,
          buy_md_amount REAL,
          buy_md_amount_rate REAL,
          buy_sm_amount REAL,
          buy_sm_amount_rate REAL,
          rank INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(trade_date, name)
        )
    """)

    # 3. 创建索引
    print("创建索引...")
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_market_moneyflow_date ON market_moneyflow(trade_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_date ON sector_moneyflow(trade_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_name ON sector_moneyflow(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_date_name ON sector_moneyflow(trade_date, name)')

    conn.commit()
    conn.close()
    print("数据库结构修复完成！")

if __name__ == "__main__":
    fix_schema()
