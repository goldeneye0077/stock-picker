// 测试修复后的成交量异动 API 逻辑
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/stock_picker.db');

console.log('=== 测试修复后的成交量异动 API ===\n');

const surgeSql = `
  SELECT
    va.*,
    s.name as stock_name,
    k.volume as actual_volume,
    k.close as price
  FROM volume_analysis va
  LEFT JOIN stocks s ON va.stock_code = s.code
  LEFT JOIN klines k ON va.stock_code = k.stock_code AND va.date = k.date
  WHERE va.is_volume_surge = 1
  ORDER BY va.date DESC, va.volume_ratio DESC
  LIMIT 10
`;

db.all(surgeSql, [], (err, rows) => {
  if (err) {
    console.error('❌ 查询错误:', err);
    db.close();
    return;
  }

  console.log(`✅ 找到 ${rows.length} 条最新成交量异动记录\n`);

  rows.forEach((row, index) => {
    console.log(`[${index + 1}] ${row.stock_code} - ${row.stock_name || '未知'}`);
    console.log(`    量比: ${row.volume_ratio?.toFixed(2)} 倍`);
    console.log(`    日期: ${row.date}`);
    console.log(`    价格: ¥${row.price || 'N/A'}`);
    console.log('');
  });

  // 模拟前端接收的数据
  const volumeData = rows.map(item => ({
    stock: item.stock_code,
    name: item.stock_name || '未知股票',
    volumeRatio: item.volume_ratio,
    trend: item.volume_ratio > 2 ? 'up' : 'down'
  }));

  console.log('=== 前端将接收到的数据 ===\n');
  console.log(JSON.stringify(volumeData.slice(0, 3), null, 2));
  console.log(`\n✅ 总共 ${volumeData.length} 条数据\n`);

  db.close();
});
