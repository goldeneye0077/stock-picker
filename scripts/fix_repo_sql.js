const fs = require('fs');
const filepath = 'e:/stock_an/stock-picker-latest/backend/src/repositories/AnalysisRepository.ts';
let content = fs.readFileSync(filepath, 'utf8');

// 1. Fix getMarketLimitUpSnapshot: ts_code -> stock_code, trade_date -> snapshot_time
// The SQL is: COUNT(DISTINCT ts_code) as count, SUM(CASE WHEN change_percent >= 9.5 THEN 1 ELSE 0 END) as limit_up FROM quote_history WHERE trade_date = ?
content = content.replace(
    /COUNT\(DISTINCT ts_code\) as count,\s*\n\s*SUM\(CASE WHEN change_percent >= 9\.5 THEN 1 ELSE 0 END\) as limit_up\s*\n\s*FROM quote_history\s*\n\s*WHERE trade_date = \?/g,
    `COUNT(DISTINCT stock_code) as count,
        SUM(CASE WHEN change_percent >= 9.5 THEN 1 ELSE 0 END) as limit_up
      FROM quote_history
      WHERE DATE(snapshot_time) = ?`
);

// 2. Fix getSuperMainForceWeeklyComparison: q.ts_code -> q.stock_code (already partially fixed)
// But let's ensure any remaining ts_code references in quote_history joins are fixed
content = content.replace(
    /INNER JOIN quote_history q ON s\.ts_code = q\.ts_code/g,
    'INNER JOIN quote_history q ON s.ts_code = q.stock_code'
);

// 3. Fix getLatestQuoteTradeDate: trade_date column doesn't exist in quote_history
content = content.replace(
    /SELECT\s+trade_date\s+FROM quote_history\s*\n\s*ORDER BY trade_date DESC/g,
    `SELECT DATE(snapshot_time) as trade_date FROM quote_history
      ORDER BY snapshot_time DESC`
);

// Also fix any remaining references
content = content.replace(
    /FROM quote_history\s*\r?\n\s*WHERE trade_date = \?/g,
    `FROM quote_history
      WHERE DATE(snapshot_time) = ?`
);

// Fix q.trade_date references to snapshot_time
content = content.replace(/q\.trade_date/g, 'DATE(q.snapshot_time)');

// Verify changes
const tsCodeInQuoteHistory = content.match(/quote_history.*ts_code|ts_code.*quote_history/g);
console.log('Remaining ts_code near quote_history:', tsCodeInQuoteHistory || 'none');

const tradeeDateInQuoteHistory = content.match(/quote_history[\s\S]{0,50}trade_date/g);
console.log('trade_date near quote_history:', tradeeDateInQuoteHistory ? tradeeDateInQuoteHistory.length : 0);

fs.writeFileSync(filepath, content, 'utf8');
console.log('AnalysisRepository.ts patched successfully');
