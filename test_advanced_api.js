const axios = require('axios');

async function testApi() {
  try {
    console.log('正在请求高级选股接口...');
    // 注意：根据之前的日志，数据服务端口是 8002
    const response = await axios.post('http://localhost:8002/api/advanced-selection/advanced/run', {
      min_score: 60,
      max_results: 5,
      require_uptrend: true,
      require_hot_sector: true
    });

    const results = response.data.results;
    if (results && results.length > 0) {
      console.log('获取到结果:', results.length, '条');
      const firstResult = results[0];
      console.log('第一条数据详情:');
      console.log('股票:', firstResult.stock_name, firstResult.stock_code);
      console.log('综合评分:', firstResult.composite_score);
      console.log('入选理由:', firstResult.selection_reason);
      console.log('买入点 (buy_point):', firstResult.buy_point);
      console.log('高抛点 (sell_point):', firstResult.sell_point);
      console.log('是否包含新字段?', 
        firstResult.buy_point !== undefined ? '✅ 是' : '❌ 否'
      );
    } else {
      console.log('未获取到选股结果');
    }
  } catch (error) {
    console.error('API 请求失败:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

testApi();
