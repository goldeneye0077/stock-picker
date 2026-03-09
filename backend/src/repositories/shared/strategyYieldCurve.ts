export type YieldCurveResponse = {
  dates: string[];
  values: number[];
  benchmarkValues: number[];
  benchmarkLabel: string;
};

type QueryRunner = <T = any>(sql: string, params?: any[]) => Promise<T[]>;

type StrategyYieldCurveConfig = {
  klineTable: string;
  klineDateColumn: string;
  klineStockCodeColumn: string;
  signalTable: string;
  signalCreatedAtColumn: string;
  signalStockCodeColumn: string;
  signalDateIsTimestampTz?: boolean;
  fallbackSignalTable?: string;
  fallbackSignalDateColumn?: string;
  fallbackSignalStockCodeColumn?: string;
  fallbackSignalDateIsTimestampTz?: boolean;
  stockTable: string;
  stockCodeColumn: string;
  stockNameColumn: string;
};

type GetStrategyYieldCurveParams = {
  days: number;
  query: QueryRunner;
  config: StrategyYieldCurveConfig;
};

type StrategyDailyPoint = {
  dailyReturn: number;
  selectedCount: number;
};

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (raw.length >= 10) {
    return raw.slice(0, 10);
  }
  return raw;
}

function assertSqlIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return identifier;
}

function q(name: string): string {
  return assertSqlIdentifier(name);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toSignalDateExpr(tableAlias: string, columnName: string, isTimestampTz: boolean): string {
  const quotedColumn = q(columnName);
  if (isTimestampTz) {
    return `DATE(${tableAlias}.${quotedColumn} AT TIME ZONE 'Asia/Shanghai')`;
  }
  return `DATE(${tableAlias}.${quotedColumn})`;
}

async function loadStrategyDailyPoints(params: {
  days: number;
  query: QueryRunner;
  klineTable: string;
  klineDateColumn: string;
  klineStockCodeColumn: string;
  signalTable: string;
  signalDateColumn: string;
  signalStockCodeColumn: string;
  signalDateIsTimestampTz: boolean;
}): Promise<Map<string, StrategyDailyPoint>> {
  const {
    days,
    query,
    klineTable,
    klineDateColumn,
    klineStockCodeColumn,
    signalTable,
    signalDateColumn,
    signalStockCodeColumn,
    signalDateIsTimestampTz,
  } = params;

  const signalDateExpr = toSignalDateExpr('s', signalDateColumn, signalDateIsTimestampTz);
  const rows = await query<{
    trade_date: unknown;
    strategy_daily_return: unknown;
    selected_count: unknown;
  }>(`
    WITH latest_dates AS (
      SELECT trade_date
      FROM (
        SELECT DISTINCT k.${klineDateColumn} AS trade_date
        FROM ${klineTable} k
        ORDER BY trade_date DESC
        LIMIT $1
      ) d
    ),
    ordered_dates AS (
      SELECT
        trade_date,
        LEAD(trade_date) OVER (ORDER BY trade_date ASC) AS next_trade_date
      FROM latest_dates
    ),
    signal_daily AS (
      SELECT
        ${signalDateExpr} AS signal_date,
        s.${signalStockCodeColumn} AS stock_code
      FROM ${signalTable} s
      WHERE ${signalDateExpr} IN (SELECT trade_date FROM latest_dates)
      GROUP BY ${signalDateExpr}, s.${signalStockCodeColumn}
    ),
    strategy_daily AS (
      SELECT
        od.next_trade_date AS trade_date,
        COUNT(*) AS selected_count,
        AVG(
          CASE
            WHEN k.open > 0 AND k.close > 0 THEN (k.close - k.open) / k.open
            ELSE NULL
          END
        ) AS strategy_daily_return
      FROM signal_daily sd
      INNER JOIN ordered_dates od ON od.trade_date = sd.signal_date
      INNER JOIN ${klineTable} k
        ON k.${klineStockCodeColumn} = sd.stock_code
       AND k.${klineDateColumn} = od.next_trade_date
      WHERE od.next_trade_date IS NOT NULL
      GROUP BY od.next_trade_date
    )
    SELECT
      ld.trade_date,
      COALESCE(sd.strategy_daily_return, 0) AS strategy_daily_return,
      COALESCE(sd.selected_count, 0) AS selected_count
    FROM latest_dates ld
    LEFT JOIN strategy_daily sd ON sd.trade_date = ld.trade_date
    ORDER BY ld.trade_date ASC
  `, [days]);

  const points = new Map<string, StrategyDailyPoint>();
  rows.forEach((row) => {
    const tradeDate = normalizeDate(row.trade_date);
    const dailyReturn = toFiniteNumber(row.strategy_daily_return);
    const selectedCount = Number(row.selected_count || 0);
    if (!tradeDate || dailyReturn === null) {
      return;
    }
    points.set(tradeDate, {
      dailyReturn,
      selectedCount: Number.isFinite(selectedCount) ? selectedCount : 0,
    });
  });
  return points;
}

const HS300_REMOTE_CACHE_TTL_MS = 10 * 60 * 1000;
let hs300RemoteCache: {
  key: string;
  fetchedAt: number;
  closeByDate: Map<string, number>;
} | null = null;

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHs300ClosesFromEastmoney(startDate: string, endDate: string): Promise<Map<string, number>> {
  const beg = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');
  const secids = ['1.000300', '0.399300'];
  const closeByDate = new Map<string, number>();

  for (const secid of secids) {
    try {
      const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
      url.searchParams.set('secid', secid);
      url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6');
      url.searchParams.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58');
      url.searchParams.set('klt', '101');
      url.searchParams.set('fqt', '0');
      url.searchParams.set('beg', beg);
      url.searchParams.set('end', end);

      const payload = await fetchJsonWithTimeout(url.toString(), 6000);
      const klines = Array.isArray(payload?.data?.klines) ? payload.data.klines : [];

      klines.forEach((line: unknown) => {
        if (typeof line !== 'string') {
          return;
        }
        const parts = line.split(',');
        if (parts.length < 3) {
          return;
        }
        const tradeDate = normalizeDate(parts[0]);
        const closeValue = toFiniteNumber(parts[2]);
        if (!tradeDate || closeValue === null || closeValue <= 0) {
          return;
        }
        closeByDate.set(tradeDate, closeValue);
      });

      if (closeByDate.size >= 2) {
        break;
      }
    } catch (error) {
      // Ignore transient upstream failures and continue with next secid.
      console.warn('[yield-curve] fetch HS300 failed:', error);
    }
  }

  return closeByDate;
}

async function fetchHs300ClosesFromTencent(startDate: string, endDate: string): Promise<Map<string, number>> {
  const closeByDate = new Map<string, number>();
  try {
    const url = new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get');
    url.searchParams.set('param', `sh000300,day,${startDate},${endDate},640,qfq`);
    const payload = await fetchJsonWithTimeout(url.toString(), 6000);
    const dayKlines = payload?.data?.sh000300?.day;
    const rows: unknown[] = Array.isArray(dayKlines) ? dayKlines : [];
    rows.forEach((row) => {
      if (!Array.isArray(row) || row.length < 3) {
        return;
      }
      const tradeDate = normalizeDate(row[0]);
      const closeValue = toFiniteNumber(row[2]);
      if (!tradeDate || closeValue === null || closeValue <= 0) {
        return;
      }
      closeByDate.set(tradeDate, closeValue);
    });
  } catch (error) {
    console.warn('[yield-curve] fetch HS300 from tencent failed:', error);
  }
  return closeByDate;
}

async function fetchHs300ClosesFromRemote(startDate: string, endDate: string): Promise<Map<string, number>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return new Map();
  }

  const key = `${startDate}_${endDate}`;
  const now = Date.now();
  if (hs300RemoteCache && hs300RemoteCache.key === key && now - hs300RemoteCache.fetchedAt < HS300_REMOTE_CACHE_TTL_MS) {
    return new Map(hs300RemoteCache.closeByDate);
  }

  const closeByDate = await fetchHs300ClosesFromTencent(startDate, endDate);
  if (closeByDate.size < 2) {
    const eastmoneyRows = await fetchHs300ClosesFromEastmoney(startDate, endDate);
    eastmoneyRows.forEach((value, date) => closeByDate.set(date, value));
  }

  hs300RemoteCache = {
    key,
    fetchedAt: now,
    closeByDate: new Map(closeByDate),
  };

  return closeByDate;
}

export async function getStrategyYieldCurveShared({
  days,
  query,
  config,
}: GetStrategyYieldCurveParams): Promise<YieldCurveResponse> {
  const klineTable = q(config.klineTable);
  const klineDateColumn = q(config.klineDateColumn);
  const klineStockCodeColumn = q(config.klineStockCodeColumn);
  const signalTable = q(config.signalTable);
  const signalCreatedAtColumn = q(config.signalCreatedAtColumn);
  const signalStockCodeColumn = q(config.signalStockCodeColumn);
  const fallbackSignalTable = config.fallbackSignalTable ? q(config.fallbackSignalTable) : null;
  const fallbackSignalDateColumn = config.fallbackSignalDateColumn ? q(config.fallbackSignalDateColumn) : null;
  const fallbackSignalStockCodeColumn = config.fallbackSignalStockCodeColumn ? q(config.fallbackSignalStockCodeColumn) : null;
  const stockTable = q(config.stockTable);
  const stockCodeColumn = q(config.stockCodeColumn);
  const stockNameColumn = q(config.stockNameColumn);

  const tradeDateRows = await query<{
    trade_date: unknown;
  }>(`
    SELECT trade_date
    FROM (
      SELECT DISTINCT k.${klineDateColumn} AS trade_date
      FROM ${klineTable} k
      ORDER BY trade_date DESC
      LIMIT $1
    ) d
    ORDER BY trade_date ASC
  `, [days]);

  const dates = tradeDateRows
    .map((row) => normalizeDate(row.trade_date))
    .filter((date) => date.length > 0);

  if (dates.length === 0) {
    return { dates: [], values: [], benchmarkValues: [], benchmarkLabel: '\u6CAA\u6DF1300' };
  }

  const primaryStrategyPoints = await loadStrategyDailyPoints({
    days,
    query,
    klineTable,
    klineDateColumn,
    klineStockCodeColumn,
    signalTable,
    signalDateColumn: signalCreatedAtColumn,
    signalStockCodeColumn,
    signalDateIsTimestampTz: config.signalDateIsTimestampTz ?? true,
  });

  let fallbackStrategyPoints: Map<string, StrategyDailyPoint> | null = null;
  if (fallbackSignalTable && fallbackSignalDateColumn && fallbackSignalStockCodeColumn) {
    try {
      fallbackStrategyPoints = await loadStrategyDailyPoints({
        days,
        query,
        klineTable,
        klineDateColumn,
        klineStockCodeColumn,
        signalTable: fallbackSignalTable,
        signalDateColumn: fallbackSignalDateColumn,
        signalStockCodeColumn: fallbackSignalStockCodeColumn,
        signalDateIsTimestampTz: config.fallbackSignalDateIsTimestampTz ?? false,
      });
    } catch (error) {
      console.warn('[yield-curve] fallback signal source unavailable:', error);
      fallbackStrategyPoints = null;
    }
  }

  const strategyReturnByDate = new Map<string, number>();
  dates.forEach((date) => {
    const primaryPoint = primaryStrategyPoints.get(date);
    if (primaryPoint && primaryPoint.selectedCount > 0) {
      strategyReturnByDate.set(date, primaryPoint.dailyReturn);
      return;
    }

    const fallbackPoint = fallbackStrategyPoints?.get(date);
    if (fallbackPoint && fallbackPoint.selectedCount > 0) {
      strategyReturnByDate.set(date, fallbackPoint.dailyReturn);
    }
  });

  const hs300Rows = await query<{
    trade_date: unknown;
    close_value: unknown;
  }>(`
    WITH latest_dates AS (
      SELECT trade_date
      FROM (
        SELECT DISTINCT k.${klineDateColumn} AS trade_date
        FROM ${klineTable} k
        ORDER BY trade_date DESC
        LIMIT $1
      ) d
    ),
    hs300_candidates AS (
      SELECT
        k.${klineDateColumn} AS trade_date,
        k.${klineStockCodeColumn} AS stock_code,
        k.close,
        CASE
          WHEN regexp_replace(k.${klineStockCodeColumn}, '[^0-9]', '', 'g') = '000300' THEN 1
          WHEN regexp_replace(k.${klineStockCodeColumn}, '[^0-9]', '', 'g') = '399300' THEN 2
          ELSE 9
        END AS code_priority
      FROM ${klineTable} k
      LEFT JOIN ${stockTable} s ON s.${stockCodeColumn} = k.${klineStockCodeColumn}
      INNER JOIN latest_dates ld ON ld.trade_date = k.${klineDateColumn}
      WHERE (
        regexp_replace(k.${klineStockCodeColumn}, '[^0-9]', '', 'g') IN ('000300', '399300')
        OR COALESCE(s.${stockNameColumn}, '') LIKE '%\u6CAA\u6DF1300%'
        OR LOWER(COALESCE(s.${stockNameColumn}, '')) LIKE '%csi300%'
      )
        AND k.close IS NOT NULL
        AND k.close > 0
    ),
    ranked AS (
      SELECT
        trade_date,
        close,
        ROW_NUMBER() OVER (PARTITION BY trade_date ORDER BY code_priority ASC, stock_code ASC) AS rn
      FROM hs300_candidates
    )
    SELECT
      trade_date,
      close AS close_value
    FROM ranked
    WHERE rn = 1
    ORDER BY trade_date ASC
  `, [days]);

  const hs300CloseByDate = new Map<string, number>();
  hs300Rows.forEach((row) => {
    const tradeDate = normalizeDate(row.trade_date);
    const closeValue = toFiniteNumber(row.close_value);
    if (tradeDate && closeValue !== null && closeValue > 0) {
      hs300CloseByDate.set(tradeDate, closeValue);
    }
  });

  const matchedDateCountInDb = dates.filter((date) => hs300CloseByDate.has(date)).length;
  if (matchedDateCountInDb < 2) {
    const remoteHs300 = await fetchHs300ClosesFromRemote(dates[0], dates[dates.length - 1]);
    if (remoteHs300.size > 0) {
      const dateSet = new Set(dates);
      remoteHs300.forEach((closeValue, tradeDate) => {
        if (dateSet.has(tradeDate)) {
          hs300CloseByDate.set(tradeDate, closeValue);
        }
      });
    }
  }

  const hasRealHs300 = dates.filter((date) => hs300CloseByDate.has(date)).length >= 2;
  const navDigits = 6;
  const values: number[] = [];
  const benchmarkValues: number[] = hasRealHs300 ? [1] : [];
  let strategyNav = 1;
  let benchmarkNav = 1;
  let prevHs300Close: number | null = null;

  dates.forEach((tradeDate, index) => {
    if (index === 0) {
      values.push(1);
      if (hasRealHs300) {
        const firstHs300Close = hs300CloseByDate.get(tradeDate);
        if (firstHs300Close !== undefined && firstHs300Close > 0) {
          prevHs300Close = firstHs300Close;
        }
      }
      return;
    }

    const strategyDailyReturn = Math.max(-0.2, Math.min(0.2, strategyReturnByDate.get(tradeDate) ?? 0));
    strategyNav = Math.max(strategyNav * (1 + strategyDailyReturn), 0.2);
    values.push(roundTo(strategyNav, navDigits));

    if (!hasRealHs300) {
      return;
    }

    let benchmarkDailyReturn = 0;
    const hs300Close = hs300CloseByDate.get(tradeDate);
    if (hs300Close !== undefined && hs300Close > 0) {
      if (prevHs300Close !== null && prevHs300Close > 0) {
        benchmarkDailyReturn = (hs300Close - prevHs300Close) / prevHs300Close;
      }
      prevHs300Close = hs300Close;
    }

    benchmarkDailyReturn = Math.max(-0.12, Math.min(0.12, benchmarkDailyReturn));
    benchmarkNav = Math.max(benchmarkNav * (1 + benchmarkDailyReturn), 0.2);
    benchmarkValues.push(roundTo(benchmarkNav, navDigits));
  });

  return {
    dates,
    values,
    benchmarkValues,
    benchmarkLabel: '\u6CAA\u6DF1300',
  };
}
