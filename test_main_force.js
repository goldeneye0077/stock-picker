// 测试主力行为分析功能
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/stock_picker.db');

console.log('=== 测试主力行为分析功能 ===\n');

// 检查fund_flow表数据
console.log('📊 步骤1: 检查fund_flow表数据');
const checkSql = `
  SELECT COUNT(*) as total,
         COUNT(DISTINCT stock_code) as stock_count,
         MIN(date) as earliest_date,
         MAX(date) as latest_date
  FROM fund_flow
`;

db.get(checkSql, [], (err, row) => {
  if (err) {
    console.error('❌ 查询错误:', err);
    return;
  }
  console.log(`✅ fund_flow表统计:`);
  console.log(`   - 总记录数: ${row.total}`);
  console.log(`   - 股票数量: ${row.stock_count}`);
  console.log(`   - 最早日期: ${row.earliest_date}`);
  console.log(`   - 最新日期: ${row.latest_date}`);
  console.log('');

  // 测试主力行为分析SQL
  console.log('📊 步骤2: 测试主力行为分析SQL');
  const days = 7;
  const limit = 10;

  const mainForceSql = `
    WITH latest_date AS (
      SELECT MAX(date) as max_date FROM fund_flow
    ),
    recent_flow AS (
      SELECT
        ff.stock_code,
        s.name as stock_name,
        ff.date,
        ff.main_fund_flow,
        ff.retail_fund_flow,
        ff.institutional_flow,
        ff.large_order_ratio,
        k.volume,
        k.close as price,
        ROW_NUMBER() OVER (PARTITION BY ff.stock_code ORDER BY ff.date DESC) as rn
      FROM fund_flow ff
      CROSS JOIN latest_date ld
      LEFT JOIN stocks s ON ff.stock_code = s.code
      LEFT JOIN klines k ON ff.stock_code = k.stock_code AND ff.date = k.date
      WHERE ff.date >= date(ld.max_date, '-${days} days')
    ),
    stock_analysis AS (
      SELECT
        stock_code,
        stock_name,
        SUM(main_fund_flow) as total_main_flow,
        AVG(main_fund_flow) as avg_main_flow,
        SUM(CASE WHEN main_fund_flow > 0 THEN 1 ELSE 0 END) as inflow_days,
        COUNT(*) as total_days,
        AVG(large_order_ratio) as avg_large_order_ratio,
        SUM(volume) as total_volume,
        MAX(price) as latest_price
      FROM recent_flow
      WHERE rn <= ${days}
      GROUP BY stock_code, stock_name
      HAVING total_main_flow IS NOT NULL
    )
    SELECT
      stock_code,
      stock_name,
      total_main_flow,
      avg_main_flow,
      inflow_days,
      total_days,
      avg_large_order_ratio,
      total_volume,
      latest_price,
      CASE
        WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.7 THEN 'strong_accumulation'
        WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.5 THEN 'accumulation'
        WHEN total_main_flow < 0 AND inflow_days <= total_days * 0.3 THEN 'distribution'
        WHEN ABS(total_main_flow) < 10000000 THEN 'neutral'
        ELSE 'volatile'
      END as behavior_type,
      CASE
        WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.7 THEN
          CAST(MIN(100, 50 + (inflow_days * 100.0 / total_days) + (avg_large_order_ratio * 30)) AS INTEGER)
        WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.5 THEN
          CAST(MIN(100, 40 + (inflow_days * 80.0 / total_days) + (avg_large_order_ratio * 20)) AS INTEGER)
        WHEN total_main_flow < 0 THEN
          CAST(MAX(20, 60 - ((total_days - inflow_days) * 80.0 / total_days)) AS INTEGER)
        ELSE
          CAST(50 + (avg_large_order_ratio * 20) AS INTEGER)
      END as strength
    FROM stock_analysis
    WHERE ABS(total_main_flow) > 5000000
    ORDER BY
      CASE
        WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.7 THEN 1
        WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.5 THEN 2
        ELSE 3
      END,
      ABS(total_main_flow) DESC
    LIMIT ?
  `;

  db.all(mainForceSql, [limit], (err, rows) => {
    if (err) {
      console.error('❌ 主力行为分析查询错误:', err);
      db.close();
      return;
    }

    console.log(`✅ 找到 ${rows.length} 条主力行为记录:\n`);

    if (rows.length === 0) {
      console.log('⚠️  没有找到符合条件的主力行为数据');
      console.log('   可能原因:');
      console.log('   1. fund_flow 表中最近7天没有数据');
      console.log('   2. 所有股票的主力资金流动都小于500万');
      console.log('');

      // 检查最近有数据的日期
      const recentSql = `
        SELECT date, COUNT(*) as count
        FROM fund_flow
        GROUP BY date
        ORDER BY date DESC
        LIMIT 10
      `;

      db.all(recentSql, [], (err, dateRows) => {
        if (!err) {
          console.log('📅 fund_flow表最近的数据日期:');
          dateRows.forEach(row => {
            console.log(`   ${row.date}: ${row.count} 条记录`);
          });
        }
        db.close();
      });
    } else {
      rows.forEach((row, i) => {
        let behaviorText = '';
        switch (row.behavior_type) {
          case 'strong_accumulation':
            behaviorText = '大幅建仓';
            break;
          case 'accumulation':
            behaviorText = '持续建仓';
            break;
          case 'distribution':
            behaviorText = '缓慢减仓';
            break;
          case 'volatile':
            behaviorText = '震荡洗盘';
            break;
          case 'neutral':
            behaviorText = '稳定持有';
            break;
        }

        console.log(`[${i+1}] ${row.stock_code} ${row.stock_name}`);
        console.log(`    行为: ${behaviorText} (${row.behavior_type})`);
        console.log(`    强度: ${row.strength}`);
        console.log(`    主力资金流: ${(row.total_main_flow / 10000).toFixed(2)}万`);
        console.log(`    流入天数: ${row.inflow_days}/${row.total_days}天`);
        console.log(`    大单占比: ${(row.avg_large_order_ratio * 100).toFixed(2)}%`);
        console.log('');
      });

      db.close();
    }
  });
});
