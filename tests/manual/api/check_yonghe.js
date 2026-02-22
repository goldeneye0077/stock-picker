// 检查永和股份(605020)的成交量数据
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/stock_picker.db');

console.log('=== 检查永和股份(605020)数据 ===\n');

// 1. 检查成交量异动数据
console.log('📊 1. 成交量异动分析表数据:');
const volumeSql = `
  SELECT va.*, s.name
  FROM volume_analysis va
  LEFT JOIN stocks s ON va.stock_code = s.code
  WHERE va.stock_code = '605020'
  ORDER BY va.date DESC
  LIMIT 10
`;

db.all(volumeSql, [], (err, rows) => {
  if (err) {
    console.error('❌ 查询错误:', err);
    return;
  }

  if (rows.length === 0) {
    console.log('⚠️  volume_analysis表中没有605020的数据\n');
  } else {
    console.log(`✅ 找到 ${rows.length} 条记录:\n`);
    rows.forEach((row, i) => {
      console.log(`[${i+1}] 日期: ${row.date}`);
      console.log(`    量比: ${row.volume_ratio?.toFixed(2)}`);
      console.log(`    是否异动: ${row.is_volume_surge === 1 ? '是' : '否'}`);
      console.log(`    平均量: ${row.avg_volume}`);
      console.log('');
    });
  }

  // 2. 检查K线数据
  console.log('📈 2. K线表数据:');
  const klineSql = `
    SELECT k.*, s.name
    FROM klines k
    LEFT JOIN stocks s ON k.stock_code = s.code
    WHERE k.stock_code = '605020'
    ORDER BY k.date DESC
    LIMIT 10
  `;

  db.all(klineSql, [], (err, rows) => {
    if (err) {
      console.error('❌ 查询错误:', err);
      return;
    }

    if (rows.length === 0) {
      console.log('⚠️  klines表中没有605020的数据\n');
    } else {
      console.log(`✅ 找到 ${rows.length} 条K线记录:\n`);
      rows.forEach((row, i) => {
        console.log(`[${i+1}] 日期: ${row.date}`);
        console.log(`    成交量: ${row.volume}`);
        console.log(`    收盘价: ${row.close}`);
        console.log('');
      });
    }

    // 3. 检查资金流向数据
    console.log('💰 3. 资金流向表数据:');
    const fundSql = `
      SELECT ff.*, s.name
      FROM fund_flow ff
      LEFT JOIN stocks s ON ff.stock_code = s.code
      WHERE ff.stock_code = '605020'
      ORDER BY ff.date DESC
      LIMIT 10
    `;

    db.all(fundSql, [], (err, rows) => {
      if (err) {
        console.error('❌ 查询错误:', err);
        db.close();
        return;
      }

      if (rows.length === 0) {
        console.log('⚠️  fund_flow表中没有605020的数据');
      } else {
        console.log(`✅ 找到 ${rows.length} 条资金流向记录:\n`);
        rows.forEach((row, i) => {
          console.log(`[${i+1}] 日期: ${row.date}`);
          console.log(`    主力资金流: ${(row.main_fund_flow / 10000).toFixed(2)}万`);
          console.log(`    大单占比: ${(row.large_order_ratio * 100).toFixed(2)}%`);
          console.log('');
        });
      }

      console.log('\n=== 分析结论 ===');
      console.log('主力行为分析依赖: fund_flow表 ✅');
      console.log('成交量异动分析依赖: volume_analysis表 (需检查)\n');

      db.close();
    });
  });
});
