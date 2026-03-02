import { Pool } from 'pg';
import crypto from 'crypto';
import { convertSqliteQuery } from './sqliteCompat';

function resolveDatabaseUrl(): string {
  const explicit = (process.env.DATABASE_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  const timescale = (process.env.TIMESCALE_URL || '').trim();
  if (timescale) {
    return timescale;
  }

  return 'postgresql://postgres:postgres@timescaledb:5432/stock_picker';
}

function isProductionEnvironment(): boolean {
  return (process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function assertAdminPasswordStrength(password: string): void {
  const hasMinLength = password.length >= 12;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!hasMinLength || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    throw new Error(
      'ADMIN_PASSWORD must be at least 12 chars and include upper/lower letters, numbers, and symbols in production'
    );
  }
}

function resolveBootstrapAdminPassword(adminPassword: string): string {
  if (adminPassword) {
    if (isProductionEnvironment()) {
      assertAdminPasswordStrength(adminPassword);
    }
    return adminPassword;
  }

  if (isProductionEnvironment()) {
    throw new Error('ADMIN_PASSWORD is required for first startup in production');
  }

  const generated = crypto.randomBytes(18).toString('base64url');
  console.warn(`[SECURITY] ADMIN_PASSWORD is not set. Generated temporary admin password: ${generated}`);
  return generated;
}

const databaseUrl = resolveDatabaseUrl();

export class Database {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DB_POOL_MAX || 16),
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000),
    });

    this.pool.on('error', (error) => {
      console.error('[database] pool error:', error);
    });
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    const converted = convertSqliteQuery(sql, params);
    if (converted.skip) {
      return;
    }
    await this.pool.query(converted.text, converted.values);
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const converted = convertSqliteQuery(sql, params);
    if (converted.skip) {
      return undefined;
    }
    const result = await this.pool.query(converted.text, converted.values);
    return result.rows[0];
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const converted = convertSqliteQuery(sql, params);
    if (converted.skip) {
      return [];
    }
    const result = await this.pool.query(converted.text, converted.values);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

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
      volume BIGINT NOT NULL,
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
      avg_volume_20 BIGINT NOT NULL,
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
      volume BIGINT NOT NULL,
      analysis_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_code) REFERENCES stocks (code)
    )
  `);

  // 瀹炴椂琛屾儏琛紙淇濆瓨姣忓彧鑲＄エ鐨勬渶鏂拌鎯咃級
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
      vol BIGINT,
      amount REAL,
      num BIGINT,
      ask_volume1 BIGINT,
      bid_volume1 BIGINT,
      change_percent REAL,
      change_amount REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_code) REFERENCES stocks (code)
    )
  `);

  // 鍘嗗彶琛屾儏蹇収琛紙淇濆瓨鎵€鏈夊巻鍙茶褰曪級
  await db.run(`
    CREATE TABLE IF NOT EXISTS quote_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      pre_close REAL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      vol BIGINT,
      amount REAL,
      num BIGINT,
      change_percent REAL,
      snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_code) REFERENCES stocks (code)
    )
  `);

  await db.run('ALTER TABLE klines ALTER COLUMN volume TYPE BIGINT');
  await db.run('ALTER TABLE volume_analysis ALTER COLUMN avg_volume_20 TYPE BIGINT');
  await db.run('ALTER TABLE buy_signals ALTER COLUMN volume TYPE BIGINT');
  await db.run('ALTER TABLE realtime_quotes ALTER COLUMN vol TYPE BIGINT');
  await db.run('ALTER TABLE realtime_quotes ALTER COLUMN num TYPE BIGINT');
  await db.run('ALTER TABLE realtime_quotes ALTER COLUMN ask_volume1 TYPE BIGINT');
  await db.run('ALTER TABLE realtime_quotes ALTER COLUMN bid_volume1 TYPE BIGINT');
  await db.run('ALTER TABLE quote_history ALTER COLUMN vol TYPE BIGINT');
  await db.run('ALTER TABLE quote_history ALTER COLUMN num TYPE BIGINT');

  // 姣忔棩鎸囨爣琛紙鎶€鏈垎鏋愭寚鏍囷級
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

  // 澶х洏璧勯噾娴佸悜琛紙涓滆储甯傚満璧勯噾娴佸悜鏁版嵁锛?
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

  // 鏉垮潡璧勯噾娴佸悜琛紙涓滆储姒傚康鍙婅涓氭澘鍧楄祫閲戞祦鍚戞暟鎹級
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

  // 鍒涘缓绱㈠紩浼樺寲鏌ヨ鎬ц兘
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

  await db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 椤甸潰璁块棶璁板綍琛紙鐢ㄤ簬缃戠珯缁熻锛?
  await db.run(`
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_path TEXT NOT NULL,
      user_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // API 璋冪敤鏃ュ織琛紙鐢ㄤ簬缃戠珯缁熻锛?
  await db.run(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,
      user_id INTEGER,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);


  // 用户留言表（联系我功能）
  await db.run(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      source_page TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
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
  await db.run('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)');
  // 缃戠珯缁熻琛ㄧ储寮?
  await db.run('CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_page_views_user_id ON page_views(user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_page_views_page_path ON page_views(page_path)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_contact_messages_user_id ON contact_messages(user_id)');

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();

  const adminCount = await db.get('SELECT COUNT(*) as cnt FROM users WHERE is_admin = 1');
  const adminCountValue = Number(adminCount?.cnt ?? 0);
  if (adminCountValue === 0) {
    const initialPassword = resolveBootstrapAdminPassword(adminPassword);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(initialPassword, salt, 120000, 32, 'sha256').toString('hex');
    await db.run(
      'INSERT INTO users (username, password_hash, password_salt, is_admin, is_active) VALUES (?, ?, ?, ?, ?)',
      [adminUsername, hash, salt, 1, 1]
    );
  }

  if (adminPassword) {
    if (isProductionEnvironment()) {
      assertAdminPasswordStrength(adminPassword);
    }
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


