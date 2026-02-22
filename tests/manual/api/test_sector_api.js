/**
 * 测试板块资金流向 API
 */

const http = require('http');

function testAPI() {
  console.log('测试板块资金流向 API...\n');

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/analysis/sector-moneyflow?days=7',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';

    console.log(`状态码: ${res.statusCode}`);
    console.log(`响应头:`, res.headers);
    console.log('');

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        console.log('API 响应成功！\n');
        console.log('响应数据结构:');
        console.log('- success:', jsonData.success);
        console.log('- message:', jsonData.message);

        if (jsonData.data) {
          console.log('\n数据摘要:');
          console.log('- sectorFlow 记录数:', jsonData.data.sectorFlow?.length || 0);
          console.log('- summary:', JSON.stringify(jsonData.data.summary, null, 2));

          if (jsonData.data.sectorFlow && jsonData.data.sectorFlow.length > 0) {
            console.log('\n前3条数据示例:');
            jsonData.data.sectorFlow.slice(0, 3).forEach((item, index) => {
              console.log(`\n${index + 1}. ${item.name}`);
              console.log(`   日期: ${item.trade_date}`);
              console.log(`   涨跌幅: ${item.pct_change}%`);
              console.log(`   主力净额: ${(item.net_amount / 100000000).toFixed(2)}亿`);
              console.log(`   排名: ${item.rank}`);
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
