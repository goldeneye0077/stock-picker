/**
 * Test database utilities
 * Uses in-memory SQLite for fast test execution
 */

import sqlite3 from 'sqlite3';

export class TestDatabase {
  private db: sqlite3.Database;

  constructor() {
    // Use in-memory database for tests
    this.db = new sqlite3.Database(':memory:');
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
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

  /**
   * Initialize test database schema
   */
  async initSchema(): Promise<void> {
    // Stocks table
    await this.run(`
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

    // K-lines table
    await this.run(`
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

    // Volume analysis table
    await this.run(`
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

    // Fund flow table
    await this.run(`
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

    // Buy signals table
    await this.run(`
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

    // Realtime quotes table
    await this.run(`
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

    // Quote history table
    await this.run(`
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

    // Create indexes
    await this.run('CREATE INDEX IF NOT EXISTS idx_realtime_stock_code ON realtime_quotes(stock_code)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_realtime_updated_at ON realtime_quotes(updated_at)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_history_stock_code ON quote_history(stock_code)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_history_snapshot_time ON quote_history(snapshot_time)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_history_stock_time ON quote_history(stock_code, snapshot_time)');
  }

  /**
   * Seed test data
   */
  async seedTestData(): Promise<void> {
    // Insert test stocks
    await this.run(
      `INSERT INTO stocks (code, name, exchange, industry) VALUES (?, ?, ?, ?)`,
      ['000001', '平安银行', 'SZ', '银行']
    );
    await this.run(
      `INSERT INTO stocks (code, name, exchange, industry) VALUES (?, ?, ?, ?)`,
      ['600000', '浦发银行', 'SH', '银行']
    );
    await this.run(
      `INSERT INTO stocks (code, name, exchange, industry) VALUES (?, ?, ?, ?)`,
      ['600519', '贵州茅台', 'SH', '白酒']
    );

    // Insert test k-lines
    await this.run(
      `INSERT INTO klines (stock_code, date, open, high, low, close, volume, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['000001', '2025-10-22', 12.0, 12.6, 11.9, 12.5, 120000000, 1500000000]
    );
    await this.run(
      `INSERT INTO klines (stock_code, date, open, high, low, close, volume, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['600000', '2025-10-22', 8.5, 8.6, 8.2, 8.3, 80000000, 660000000]
    );

    // Insert test realtime quotes
    await this.run(
      `INSERT INTO realtime_quotes (stock_code, name, open, high, low, close, vol, amount, change_percent, change_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['000001', '平安银行', 12.0, 12.6, 11.9, 12.5, 120000000, 1500000000, 4.17, 0.5]
    );
    await this.run(
      `INSERT INTO realtime_quotes (stock_code, name, open, high, low, close, vol, amount, change_percent, change_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['600000', '浦发银行', 8.5, 8.6, 8.2, 8.3, 80000000, 660000000, -2.35, -0.2]
    );

    // Insert test volume analysis
    await this.run(
      `INSERT INTO volume_analysis (stock_code, date, volume_ratio, avg_volume_20, is_volume_surge)
       VALUES (?, ?, ?, ?, ?)`,
      ['000001', '2025-10-22', 2.5, 50000000, true]
    );

    // Insert test fund flow
    await this.run(
      `INSERT INTO fund_flow (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['000001', '2025-10-22', 500000000, -300000000, 200000000, 0.65]
    );

    // Insert test buy signals
    await this.run(
      `INSERT INTO buy_signals (stock_code, signal_type, confidence, price, volume)
       VALUES (?, ?, ?, ?, ?)`,
      ['000001', 'volume_surge', 0.85, 12.5, 120000000]
    );
  }

  /**
   * Clear all test data
   */
  async clearTestData(): Promise<void> {
    await this.run('DELETE FROM buy_signals');
    await this.run('DELETE FROM fund_flow');
    await this.run('DELETE FROM volume_analysis');
    await this.run('DELETE FROM quote_history');
    await this.run('DELETE FROM realtime_quotes');
    await this.run('DELETE FROM klines');
    await this.run('DELETE FROM stocks');
  }
}
