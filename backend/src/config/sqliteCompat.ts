type ConvertedQuery = {
  text: string;
  values: any[];
  skip?: boolean;
};

const UPSERT_CONFLICT_COLUMNS: Record<string, string[]> = {
  stocks: ['code'],
  klines: ['stock_code', 'date'],
  volume_analysis: ['stock_code', 'date'],
  fund_flow: ['stock_code', 'date'],
  buy_signals: ['stock_code', 'signal_type', 'created_at'],
  realtime_quotes: ['stock_code'],
  quote_history: ['id'],
  daily_basic: ['stock_code', 'trade_date'],
  market_moneyflow: ['trade_date'],
  sector_moneyflow: ['trade_date', 'name'],
  sessions: ['token'],
  user_permissions: ['user_id', 'path'],
  user_watchlists: ['user_id', 'stock_code'],
  refresh_tokens: ['token'],
  users: ['username'],
  contact_messages: ['id'],
  api_logs: ['id'],
  page_views: ['id'],
};

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^"(.+)"$/, '$1'))
    .filter(Boolean);
}

function rewriteInsertOrReplace(sql: string): string {
  const match = sql.match(
    /^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([A-Za-z0-9_."]+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\s*;?\s*$/i
  );

  if (!match) {
    return sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/ig, 'INSERT INTO');
  }

  const [, tableNameRaw, columnsRaw, restRaw] = match;
  const tableName = tableNameRaw.replace(/"/g, '');
  const columns = splitCsv(columnsRaw);
  const conflictColumns = UPSERT_CONFLICT_COLUMNS[tableName] || [];
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));

  let onConflictClause = 'ON CONFLICT DO NOTHING';
  if (conflictColumns.length > 0 && updateColumns.length > 0) {
    const updateSet = updateColumns
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(', ');
    onConflictClause = `ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSet}`;
  } else if (conflictColumns.length > 0) {
    onConflictClause = `ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`;
  }

  return `INSERT INTO ${tableNameRaw} (${columnsRaw}) ${restRaw.trim()} ${onConflictClause}`;
}

function rewriteSqliteMaster(sql: string): string {
  return sql.replace(
    /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*'([^']+)'/ig,
    (_all, tableName) =>
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}'`
  );
}

function replaceQuestionMarkPlaceholders(sql: string): string {
  let result = '';
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
      result += char;
      continue;
    }

    if (char === '"' && !inSingleQuote && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      continue;
    }

    if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      index += 1;
      result += `$${index}`;
      continue;
    }

    result += char;
  }

  return result;
}

function rewriteDateAndTimeSyntax(sql: string): string {
  let text = sql;

  text = text.replace(
    /date\(\s*'now'\s*,\s*'-'\s*\|\|\s*\$(\d+)\s*\|\|\s*' days'\s*\)/ig,
    (_all, idx) => `(CURRENT_DATE - ($${idx}::int * INTERVAL '1 day'))::date`
  );

  text = text.replace(
    /date\(\s*([^,]+?)\s*,\s*'-'\s*\|\|\s*\$(\d+)\s*\|\|\s*' days'\s*\)/ig,
    (_all, expr, idx) => `((${expr})::date - ($${idx}::int * INTERVAL '1 day'))::date`
  );

  text = text.replace(
    /date\(\s*([^)]+?)\s*,\s*'\+8 hours'\s*\)/ig,
    (_all, expr) => `DATE((${expr}) + INTERVAL '8 hour')`
  );

  text = text.replace(
    /date\(\s*'now'\s*,\s*'-(\d+)\s*days'\s*\)/ig,
    (_all, days) => `(CURRENT_DATE - INTERVAL '${days} day')::date`
  );

  text = text.replace(/date\(\s*'now'\s*\)/ig, 'CURRENT_DATE');
  text = text.replace(/datetime\(\s*'now'\s*\)/ig, 'NOW()');
  text = text.replace(/datetime\(\s*'now'\s*,\s*'localtime'\s*\)/ig, 'NOW()');

  text = text.replace(
    /substr\(\s*([^,]+?)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/ig,
    (_all, expr, from, len) => `SUBSTRING(${expr} FROM ${from} FOR ${len})`
  );
  text = text.replace(
    /substr\(\s*([^,]+?)\s*,\s*(\d+)\s*\)/ig,
    (_all, expr, from) => `SUBSTRING(${expr} FROM ${from})`
  );

  text = text.replace(/\btime\(\s*([^)]+?)\s*\)/ig, (_all, expr) => `((${expr})::time)`);
  text = text.replace(/is_volume_surge\s*=\s*1/ig, 'is_volume_surge = TRUE');

  return text;
}

function rewriteSchemaSyntax(sql: string): string {
  let text = sql;
  text = text.replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/ig, 'BIGSERIAL PRIMARY KEY');
  text = text.replace(/\bAUTOINCREMENT\b/ig, '');
  text = text.replace(/\bDATETIME\b/ig, 'TIMESTAMPTZ');
  text = text.replace(/\bBOOLEAN\s+DEFAULT\s+FALSE\b/ig, 'BOOLEAN DEFAULT FALSE');
  text = text.replace(/\bBOOLEAN\s+DEFAULT\s+TRUE\b/ig, 'BOOLEAN DEFAULT TRUE');
  text = text.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/ig, 'INSERT INTO');
  return text;
}

export function convertSqliteQuery(sql: string, params: any[] = []): ConvertedQuery {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { text: '', values: params, skip: true };
  }

  if (/^PRAGMA\b/i.test(trimmed)) {
    return { text: 'SELECT 1', values: [], skip: true };
  }

  const isInsertOrIgnore = /\bINSERT\s+OR\s+IGNORE\b/i.test(trimmed);

  let text = rewriteSqliteMaster(trimmed);
  if (/\bINSERT\s+OR\s+REPLACE\b/i.test(text)) {
    text = rewriteInsertOrReplace(text);
  }

  text = rewriteSchemaSyntax(text);
  text = replaceQuestionMarkPlaceholders(text);
  text = rewriteDateAndTimeSyntax(text);

  if (isInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(text)) {
    text = `${text.replace(/;+\s*$/, '')} ON CONFLICT DO NOTHING`;
  }

  return { text, values: params };
}
