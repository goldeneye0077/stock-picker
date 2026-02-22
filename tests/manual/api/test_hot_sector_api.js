/**
 * 测试热点板块交叉分析 API
 */

const http = require('http');

function testAPI() {
  console.log('测试热点板块交叉分析 API...\n');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/analysis/hot-sector-stocks?days=1&limit=10',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';

    console.log(`状态码: ${res.statusCode}`);
    console.log('');

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        console.log('✓ API 响应成功！\n');
        console.log('响应数据结构:');
        console.log('- success:', jsonData.success);

        if (jsonData.data) {
          console.log('\n数据摘要:');
          console.log('- 热点板块数:', jsonData.data.summary.totalSectors);
          console.log('- 龙头股票数:', jsonData.data.summary.totalStocks);
          console.log('- 平均资金流入:', (jsonData.data.summary.avgSectorMoneyFlow / 100000000).toFixed(2), '亿');

          if (jsonData.data.sectors && jsonData.data.sectors.length > 0) {
            console.log('\n热点板块示例（前3个）:');
            jsonData.data.sectors.slice(0, 3).forEach((sector, index) => {
              console.log(`\n${index + 1}. 【${sector.sectorName}】`);
              console.log(`   板块资金流入: ${(sector.sectorMoneyFlow / 100000000).toFixed(2)}亿`);
              console.log(`   板块涨跌幅: ${sector.sectorPctChange.toFixed(2)}%`);
              console.log(`   龙头股票数: ${sector.stocks.length}只`);

              if (sector.stocks.length > 0) {
                console.log(`\n   TOP 3 股票:`);
                sector.stocks.slice(0, 3).forEach((stock) => {
                  console.log(`   ${stock.rank}. ${stock.stockName} (${stock.stockCode})`);
                  console.log(`      价格: ¥${stock.price.toFixed(2)} | 涨幅: ${stock.changePercent.toFixed(2)}%`);
                  console.log(`      量比: ${stock.volumeRatio.toFixed(2)} | 主力资金: ${(stock.mainFundFlow / 10000).toFixed(0)}万`);
                  console.log(`      综合评分: ${stock.score}`);
                });
              }
            });
          }
        }

        console.log('\n✓ API 测试通过！');
      } catch (e) {
        console.error('解析响应失败:', e.message);
        console.log('原始响应:', data.substring(0, 500));
      }
    });
  });

  req.on('error', (error) => {
    console.error('请求失败:', error.message);
    console.log('\n提示: 请确保后端服务已启动 (npm run dev)');
  });

  req.end();
}

testAPI();
