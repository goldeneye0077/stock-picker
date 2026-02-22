// 测试主力行为分析API
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/analysis/main-force?days=7&limit=5',
  method: 'GET'
};

console.log('🧪 测试主力行为分析API...\n');
console.log(`📡 请求: http://${options.hostname}:${options.port}${options.path}\n`);

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);

      console.log(`✅ 状态码: ${res.statusCode}`);
      console.log(`✅ Success: ${result.success}`);

      if (result.success && result.data) {
        console.log(`\n📊 主力行为分析数据:`);
        console.log(`   - 总记录数: ${result.data.mainForce.length}`);

        console.log(`\n📈 统计摘要:`);
        console.log(`   - 强势建仓: ${result.data.summary.strongCount} 只`);
        console.log(`   - 稳定操作: ${result.data.summary.moderateCount} 只`);
        console.log(`   - 弱势减仓: ${result.data.summary.weakCount} 只`);
        console.log(`   - 平均强度: ${result.data.summary.avgStrength}%`);
        console.log(`   - 总成交量: ${result.data.summary.totalVolume} 亿`);

        console.log(`\n🎯 前5条记录:`);
        result.data.mainForce.slice(0, 5).forEach((item, index) => {
          console.log(`\n[${index + 1}] ${item.stock} ${item.name}`);
          console.log(`    行为: ${item.behavior} | 强度: ${item.strength}% | 趋势: ${item.trend}`);
          console.log(`    成交量: ${item.volume} | 持续: ${item.days}天`);
        });
      } else {
        console.log('\n⚠️ API返回数据为空或失败');
        console.log(JSON.stringify(result, null, 2));
      }

    } catch (e) {
      console.error('❌ 解析JSON失败:', e.message);
      console.log('原始响应:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ 请求失败: ${e.message}`);
});

req.end();
