import express from 'express';
import { AnalysisRepository } from '../repositories';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';
import { InvalidParameterError } from '../utils/errors';

const router = express.Router();
const analysisRepo = new AnalysisRepository();

// Get fund flow analysis
router.get('/fund-flow', asyncHandler(async (req, res) => {
  const { stock_code, days = 30, date_from, date_to } = req.query;

  // 准备查询选项
  const options: any = {
    days: Number(days),
    date_from: date_from as string | undefined,
    date_to: date_to as string | undefined
  };

  let fundFlowData = await analysisRepo.getFundFlow(options);

  // 客户端侧过滤 stock_code（Repository 方法不直接支持）
  if (stock_code) {
    fundFlowData = fundFlowData.filter((item: any) => item.stock === stock_code);
  }

  // Calculate summary statistics
  const summary = {
    totalMainFlow: 0,
    totalRetailFlow: 0,
    totalInstitutionalFlow: 0,
    avgLargeOrderRatio: 0
  };

  if (fundFlowData.length > 0) {
    summary.totalMainFlow = fundFlowData.reduce((sum: number, item: any) => sum + (item.main_fund_flow || 0), 0);
    summary.totalRetailFlow = fundFlowData.reduce((sum: number, item: any) => sum + (item.retail_fund_flow || 0), 0);
    summary.totalInstitutionalFlow = fundFlowData.reduce((sum: number, item: any) => sum + (item.institutional_flow || 0), 0);
    summary.avgLargeOrderRatio = fundFlowData.reduce((sum: number, item: any) => sum + (item.large_order_ratio || 0), 0) / fundFlowData.length;
  }

  sendSuccess(res, {
    fundFlow: fundFlowData,
    summary
  });
}));

// Get volume analysis
router.get('/volume', asyncHandler(async (req, res) => {
  const { stock_code, days = 30, exchange, board, stock_search, date_from, date_to } = req.query;

  // 准备查询选项
  const options: any = {
    days: Number(days),
    date_from: date_from as string | undefined,
    date_to: date_to as string | undefined
  };

  // 获取成交量异动数据
  let volumeSurges = await analysisRepo.getVolumeAnalysis(options);

  // 客户端侧过滤（Repository 方法不直接支持所有过滤条件）
  if (stock_code) {
    volumeSurges = volumeSurges.filter((item: any) => item.stock === stock_code);
  } else if (stock_search) {
    volumeSurges = volumeSurges.filter((item: any) =>
      item.stock?.includes(stock_search) || item.name?.includes(stock_search)
    );
  }

  if (exchange) {
    // 注意：Repository 返回的数据中没有 exchange 字段，需要额外处理
    // 这里暂时跳过 exchange 过滤，因为需要额外的股票信息
  }

  // Filter by board (based on stock code prefix)
  if (board) {
    switch (board) {
      case 'main': // 主板 (上证主板 600/601/603, 深证主板 000/001)
        volumeSurges = volumeSurges.filter((item: any) =>
          item.stock?.startsWith('60') || item.stock?.startsWith('000') || item.stock?.startsWith('001')
        );
        break;
      case 'gem': // 创业板 (300)
        volumeSurges = volumeSurges.filter((item: any) => item.stock?.startsWith('300'));
        break;
      case 'star': // 科创板 (688)
        volumeSurges = volumeSurges.filter((item: any) => item.stock?.startsWith('688'));
        break;
      case 'bse': // 北交所 (8/4)
        volumeSurges = volumeSurges.filter((item: any) =>
          item.stock?.startsWith('8') || item.stock?.startsWith('4')
        );
        break;
    }
  }

  // 限制返回数量
  volumeSurges = volumeSurges.slice(0, 50);

  // 转换字段名以匹配前端期望的格式
  const formattedVolumeSurges = volumeSurges.map((item: any) => ({
    ...item,
    stock_code: item.stock,
    stock_name: item.name,
    volume_ratio: item.volumeRatio
  }));

  // 获取特定股票的成交量分析（如果指定了 stock_code）
  let volumeData: any[] = [];
  if (stock_code) {
    volumeData = await analysisRepo.getVolumeAnalysisByStock(stock_code as string, Number(days));
  }

  sendSuccess(res, {
    volumeAnalysis: volumeData,
    volumeSurges: formattedVolumeSurges,
    total: formattedVolumeSurges.length
  });
}));

// Get buy signals
router.get('/signals', asyncHandler(async (req, res) => {
  const { stock_code, signal_type, days = 7 } = req.query;

  // 验证并转换 days 参数为数字
  const daysNum = Number(days);
  if (isNaN(daysNum) || daysNum < 0 || daysNum > 365) {
    throw new InvalidParameterError(
      'Invalid days parameter. Must be a number between 0 and 365.',
      { days, min: 0, max: 365 }
    );
  }

  let signals = await analysisRepo.getBuySignals(daysNum);

  // 客户端侧过滤（stock_code 和 signal_type）
  if (stock_code) {
    signals = signals.filter((s: any) => s.stock_code === stock_code);
  }

  if (signal_type) {
    signals = signals.filter((s: any) => s.signal_type === signal_type);
  }

  // 限制返回数量
  signals = signals.slice(0, 50);

  // Group by signal type for summary
  const signalSummary = signals.reduce((acc: any, signal: any) => {
    if (!acc[signal.signal_type]) {
      acc[signal.signal_type] = {
        count: 0,
        avgConfidence: 0,
        totalConfidence: 0
      };
    }
    acc[signal.signal_type].count++;
    acc[signal.signal_type].totalConfidence += signal.confidence;
    acc[signal.signal_type].avgConfidence = acc[signal.signal_type].totalConfidence / acc[signal.signal_type].count;
    return acc;
  }, {});

  sendSuccess(res, {
    signals,
    summary: signalSummary
  });
}));

// Get market overview
router.get('/market-overview', asyncHandler(async (req, res) => {
  const overview = await analysisRepo.getMarketOverview();

  // 获取成交量异动Top 5股票
  const topVolumeSurge = await analysisRepo.getVolumeAnalysis({ days: 7 });
  const top5VolumeSurge = topVolumeSurge.slice(0, 5);

  // 转换字段名以匹配前端期望的格式
  sendSuccess(res, {
    totalStocks: overview.totalStocks,
    upCount: overview.upCount,
    downCount: overview.downCount,
    flatCount: overview.flatCount,
    todaySignals: overview.buySignalsToday,  // 字段名转换
    volumeSurges: overview.volumeSurgeCount, // 字段名转换
    topVolumeSurge: top5VolumeSurge.map((item: any) => ({
      stock_code: item.stock,
      name: item.name,
      volume_ratio: item.volumeRatio,
      date: item.date
    }))
  });
}));

// Get main force behavior analysis
router.get('/main-force', asyncHandler(async (req, res) => {
  const { days = 7, limit = 20 } = req.query;

  // 验证并转换参数
  const daysNum = Number(days);
  const limitNum = Number(limit);

  if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
    throw new InvalidParameterError(
      'Invalid days parameter. Must be a number between 1 and 365.',
      { days, min: 1, max: 365 }
    );
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
    throw new InvalidParameterError(
      'Invalid limit parameter. Must be a number between 1 and 200.',
      { limit, min: 1, max: 200 }
    );
  }

  // 使用 Repository 方法获取主力行为数据
  const mainForceData = await analysisRepo.getMainForceBehavior(daysNum, limitNum);

  // 转换字段名以匹配前端期望的格式
  const formattedMainForceData = mainForceData.map((item: any) => ({
    stock: item.stock,
    name: item.name,
    behavior: item.behavior,
    strength: item.strength,
    trend: item.trend,
    date: item.latestDate,  // 将 latestDate 映射为 date
    latestPrice: item.latestPrice,
    latestChangePercent: item.latestChangePercent
  }));

  // 计算统计摘要（根据 behavior 字段统计）
  const summary = {
    strongCount: mainForceData.filter((item: any) => item.behavior === '强势介入').length,
    moderateCount: mainForceData.filter((item: any) => item.behavior === '稳步建仓').length,
    weakCount: mainForceData.filter((item: any) => item.behavior === '小幅流入').length,
    avgStrength: mainForceData.length > 0
      ? (mainForceData.reduce((sum: number, item: any) => sum + (item.strength || 0), 0) / mainForceData.length).toFixed(2)
      : 0,
    totalVolume: mainForceData.reduce((sum: number, item: any) => {
      const vol = parseFloat(String(item.latestVolume || 0));
      return sum + (isNaN(vol) ? 0 : vol / 100000000);
    }, 0).toFixed(1)
  };

  sendSuccess(res, {
    mainForce: formattedMainForceData,
    summary
  });
}));

export default router;