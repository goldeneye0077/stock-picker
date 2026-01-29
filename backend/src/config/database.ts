import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function resolveSqlitePath(): string {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith('sqlite:')) {
    const raw = url.slice('sqlite:'.length);
    if (raw.startsWith('///')) {
      return raw.slice(2);
    }
    return raw;
  }
  return path.resolve(__dirname, '../../..', 'data', 'stock_picker.db');
}

const dbPath = resolveSqlitePath();

// 确保数据目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Enable verbose mode for debugging
sqlite3.verbose();

export class Database {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(dbPath);
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let database: Database;

export function getDatabase(): Database {
  if (!database) {
    database = new Database();
  }
  return database;
}

export async function initDatabase(): Promise<void> {
  const db = getDatabase();

  // Create tables
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      exchange TEXT NOT NULL,
      industry TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
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
  `);

  await db.run(`
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
  `);

  await db.run(`
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
  `);

  await db.run(`
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
  `);

  // 实时行情表（保存每只股票的最新行情）
  await db.run(`
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
  `);

  // 历史行情快照表（保存所有历史记录）
  await db.run(`
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
  `);

  // 每日指标表（技术分析指标）
  await db.run(`
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
  `);

  // 大盘资金流向表（东财市场资金流向数据）
  await db.run(`
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
  `);

  // 板块资金流向表（东财概念及行业板块资金流向数据）
  await db.run(`
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
  `);

  // 创建索引优化查询性能
  await db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, path),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stock_code TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, stock_code),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (stock_code) REFERENCES stocks(code)
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_realtime_stock_code ON realtime_quotes(stock_code)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_realtime_updated_at ON realtime_quotes(updated_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_history_stock_code ON quote_history(stock_code)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_history_snapshot_time ON quote_history(snapshot_time)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_history_stock_time ON quote_history(stock_code, snapshot_time)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_daily_basic_stock_code ON daily_basic(stock_code)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_daily_basic_trade_date ON daily_basic(trade_date)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_daily_basic_stock_date ON daily_basic(stock_code, trade_date)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_market_moneyflow_date ON market_moneyflow(trade_date)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_date ON sector_moneyflow(trade_date)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_name ON sector_moneyflow(name)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_date_name ON sector_moneyflow(trade_date, name)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id ON user_watchlists(user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_user_watchlists_stock_code ON user_watchlists(stock_code)');

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  const adminCount = await db.get('SELECT COUNT(*) as cnt FROM users WHERE is_admin = 1');
  if ((adminCount?.cnt || 0) === 0) {
    const initialPassword = adminPassword || 'admin123';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(initialPassword, salt, 120000, 32, 'sha256').toString('hex');
    await db.run(
      'INSERT INTO users (username, password_hash, password_salt, is_admin, is_active) VALUES (?, ?, ?, ?, ?)',
      [adminUsername, hash, salt, 1, 1]
    );
  }

  if (adminPassword) {
    const row = await db.get('SELECT id FROM users WHERE username = ?', [adminUsername]);
    if (row?.id) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(adminPassword, salt, 120000, 32, 'sha256').toString('hex');
      await db.run(
        'UPDATE users SET password_hash = ?, password_salt = ?, is_admin = 1, is_active = 1 WHERE id = ?',
        [hash, salt, row.id]
      );
    }
  }

  const pages = [
    '/super-main-force',
    '/smart-selection',
    '/stocks',
    '/watchlist',
    '/settings',
    '/user-management'
  ];
  const adminRow = await db.get('SELECT id FROM users WHERE username = ?', [adminUsername]);
  if (adminRow?.id) {
    for (const p of pages) {
      await db.run('INSERT OR IGNORE INTO user_permissions (user_id, path) VALUES (?, ?)', [adminRow.id, p]);
    }
  }

  await db.run(
    `INSERT OR IGNORE INTO user_permissions (user_id, path)
     SELECT user_id, ? FROM user_permissions WHERE path = ?`,
    ['/watchlist', '/stocks']
  );

  console.log('Database tables created successfully');
}
