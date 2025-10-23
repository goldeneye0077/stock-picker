// 测试成交量异动筛选功能
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/stock_picker.db');

console.log('=== 测试成交量异动筛选功能 ===\n');

// 测试1: 创业板筛选
console.log('📊 测试1: 创业板 (300开头)');
const gemSql = `
  SELECT va.stock_code, s.name, s.exchange, va.volume_ratio
  FROM volume_analysis va
  LEFT JOIN stocks s ON va.stock_code = s.code
  WHERE va.is_volume_surge = 1 AND va.stock_code LIKE '300%'
  ORDER BY va.date DESC, va.volume_ratio DESC
  LIMIT 5
`;

db.all(gemSql, [], (err, rows) => {
  if (err) {
    console.error('❌ 查询错误:', err);
    return;
  }
  console.log(`✅ 找到 ${rows.length} 条创业板异动记录:`);
  rows.forEach((row, i) => {
    console.log(`  [${i+1}] ${row.stock_code} ${row.name} - 量比 ${row.volume_ratio?.toFixed(2)}`);
  });
  console.log('');

  // 测试2: 科创板筛选
  console.log('📊 测试2: 科创板 (688开头)');
  const starSql = `
    SELECT va.stock_code, s.name, s.exchange, va.volume_ratio
    FROM volume_analysis va
    LEFT JOIN stocks s ON va.stock_code = s.code
    WHERE va.is_volume_surge = 1 AND va.stock_code LIKE '688%'
    ORDER BY va.date DESC, va.volume_ratio DESC
    LIMIT 5
  `;

  db.all(starSql, [], (err, rows) => {
    if (err) {
      console.error('❌ 查询错误:', err);
      return;
    }
    console.log(`✅ 找到 ${rows.length} 条科创板异动记录:`);
    rows.forEach((row, i) => {
      console.log(`  [${i+1}] ${row.stock_code} ${row.name} - 量比 ${row.volume_ratio?.toFixed(2)}`);
    });
    console.log('');

    // 测试3: 上交所筛选
    console.log('📊 测试3: 上交所 (SSE)');
    const sseSql = `
      SELECT va.stock_code, s.name, s.exchange, va.volume_ratio
      FROM volume_analysis va
      LEFT JOIN stocks s ON va.stock_code = s.code
      WHERE va.is_volume_surge = 1 AND s.exchange = 'SSE'
      ORDER BY va.date DESC, va.volume_ratio DESC
      LIMIT 5
    `;

    db.all(sseSql, [], (err, rows) => {
      if (err) {
        console.error('❌ 查询错误:', err);
        return;
      }
      console.log(`✅ 找到 ${rows.length} 条上交所异动记录:`);
      rows.forEach((row, i) => {
        console.log(`  [${i+1}] ${row.stock_code} ${row.name} (${row.exchange}) - 量比 ${row.volume_ratio?.toFixed(2)}`);
      });
      console.log('');

      // 测试4: 模糊搜索
      console.log('📊 测试4: 搜索 "招商"');
      const searchSql = `
        SELECT va.stock_code, s.name, s.exchange, va.volume_ratio
        FROM volume_analysis va
        LEFT JOIN stocks s ON va.stock_code = s.code
        WHERE va.is_volume_surge = 1 AND (va.stock_code LIKE '%600999%' OR s.name LIKE '%招商%')
        ORDER BY va.date DESC, va.volume_ratio DESC
        LIMIT 5
      `;

      db.all(searchSql, [], (err, rows) => {
        if (err) {
          console.error('❌ 查询错误:', err);
          return;
        }
        console.log(`✅ 找到 ${rows.length} 条匹配记录:`);
        rows.forEach((row, i) => {
          console.log(`  [${i+1}] ${row.stock_code} ${row.name} - 量比 ${row.volume_ratio?.toFixed(2)}`);
        });
        console.log('\n✅ 所有筛选测试完成！');
        db.close();
      });
    });
  });
});
