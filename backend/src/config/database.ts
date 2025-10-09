import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

const dbPath = path.join(process.cwd(), '../data/stock_picker.db');

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

  console.log('Database tables created successfully');
}