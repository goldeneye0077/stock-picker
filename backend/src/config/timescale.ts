import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;
let available = false;
let lastCheckAtMs = 0;

function isEnabledByEnv(): boolean {
  const raw = (process.env.TIMESCALE_ENABLED || '').trim().toLowerCase();
  if (!raw) {
    return Boolean(process.env.TIMESCALE_URL);
  }
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

export function isTimescaleEnabled(): boolean {
  return isEnabledByEnv() && Boolean(process.env.TIMESCALE_URL);
}

export function getTimescalePool(): Pool | null {
  if (!isTimescaleEnabled()) {
    return null;
  }

  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: process.env.TIMESCALE_URL,
    max: Number(process.env.TIMESCALE_POOL_MAX || 12),
    idleTimeoutMillis: Number(process.env.TIMESCALE_POOL_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.TIMESCALE_CONNECT_TIMEOUT_MS || 5000),
  });

  pool.on('error', (error) => {
    console.error('[timescale] pool error:', error);
  });

  return pool;
}

export async function checkTimescaleAvailability(): Promise<boolean> {
  if (available) {
    return true;
  }

  const now = Date.now();
  if (now - lastCheckAtMs < 15000) {
    return false;
  }
  lastCheckAtMs = now;

  const tsPool = getTimescalePool();
  if (!tsPool) {
    available = false;
    return false;
  }

  let client: PoolClient | null = null;
  try {
    client = await tsPool.connect();
    await client.query('SELECT 1');
    available = true;
  } catch (error) {
    available = false;
    console.warn('[timescale] unavailable:', error);
  } finally {
    if (client) {
      client.release();
    }
  }

  return available;
}

export async function queryTimescale<T = any>(text: string, values: any[] = []): Promise<T[]> {
  const tsPool = getTimescalePool();
  if (!tsPool) {
    throw new Error('TimescaleDB is disabled');
  }
  const result = await tsPool.query(text, values);
  return result.rows as T[];
}

export async function closeTimescale(): Promise<void> {
  if (!pool) {
    return;
  }
  try {
    await pool.end();
  } catch (error) {
    console.error('[timescale] failed to close pool:', error);
  } finally {
    pool = null;
    available = false;
    lastCheckAtMs = 0;
  }
}
