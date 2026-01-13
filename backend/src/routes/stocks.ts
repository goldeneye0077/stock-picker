import express from 'express';
import { StockRepository } from '../repositories';
import { pinyin } from 'pinyin-pro';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendPaginatedSuccess } from '../utils/responseHelper';
import { StockNotFoundError, InvalidParameterError } from '../utils/errors';

const router = express.Router();
const stockRepo = new StockRepository();

// Get all stocks
router.get('/', asyncHandler(async (req, res) => {
  const stocks = await stockRepo.findAll();

  sendPaginatedSuccess(res, stocks, stocks.length);
}));

// Get stock by code
router.get('/:code', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const stockDetails = await stockRepo.findDetailsByCode(code);

  if (!stockDetails) {
    throw new StockNotFoundError(code);
  }

  // 扁平化数据结构以匹配前端期望
  const flattenedData = {
    // 股票基本信息
    code: stockDetails.stock.code,
    name: stockDetails.stock.name,
    exchange: stockDetails.stock.exchange,
    industry: stockDetails.stock.industry,

    // 实时行情数据
    current_price: stockDetails.realtimeQuote?.close,
    pre_close: stockDetails.realtimeQuote?.pre_close,
    open: stockDetails.realtimeQuote?.open,
    high: stockDetails.realtimeQuote?.high,
    low: stockDetails.realtimeQuote?.low,
    volume: stockDetails.realtimeQuote?.vol,
    amount: stockDetails.realtimeQuote?.amount,
    change_percent: stockDetails.realtimeQuote?.change_percent,
    change_amount: stockDetails.realtimeQuote?.change_amount,

    // 估值指标（从 daily_basic 或计算得出）
    pe_ratio: null, // 待补充
    pb_ratio: null, // 待补充
    total_market_cap: null, // 待补充
    circulating_market_cap: null, // 待补充

    // 保留原始嵌套数据供高级使用
    _raw: stockDetails
  };

  sendSuccess(res, flattenedData);
}));

// Search stocks
router.get('/search/:query', asyncHandler(async (req, res) => {
  const { query } = req.params;

  // 先进行基本搜索
  let stocks = await stockRepo.search(query, 20);

  // 如果查询看起来像拼音首字母（纯字母且长度>=1），进行拼音匹配
  const isPinyinQuery = /^[a-zA-Z]+$/.test(query);

  if (isPinyinQuery && stocks.length < 20) {
    // 获取更多股票用于拼音匹配
    const moreStocks = await stockRepo.findAllBasic(500);

    // 拼音匹配
    const queryUpper = query.toUpperCase();
    const pinyinMatched = moreStocks.filter(stock => {
      if (!stock.name) return false;
      // 获取拼音首字母
      const pinyinInitials = pinyin(stock.name, { pattern: 'first', toneType: 'none' }).toUpperCase();
      return pinyinInitials.includes(queryUpper);
    });

    // 合并结果，去重
    const codeSet = new Set(stocks.map(s => s.code));
    const uniquePinyinMatched = pinyinMatched.filter(s => !codeSet.has(s.code));
    stocks = [...stocks, ...uniquePinyinMatched];
  }

  sendSuccess(res, stocks.slice(0, 20));
}));

// Get stocks by date (历史行情查询)
router.get('/history/date/:date', asyncHandler(async (req, res) => {
  const { date } = req.params;

  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new InvalidParameterError('Invalid date format. Use YYYY-MM-DD', { date });
  }

  const stocks = await stockRepo.findByDate(date);

  // 使用自定义响应格式，包含日期信息
  res.json({
    success: true,
    data: stocks,
    total: stocks.length,
    date: date
  });
}));

// Get stock K-line history data
router.get('/:code/history', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { start_date, end_date, period = 'daily' } = req.query;

  let klines;

  if (start_date && end_date) {
    // 按日期范围查询
    klines = await stockRepo.findKLinesByDateRange(code, start_date as string, end_date as string);
  } else {
    // 默认获取最近100天
    klines = await stockRepo.findKLinesByCode(code, 100);
  }

  // 格式化数据为前端期望的格式
  const formattedKlines = klines.map(k => ({
    date: k.date,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    amount: k.amount
  }));

  sendSuccess(res, {
    klines: formattedKlines,
    period,
    total: formattedKlines.length
  });
}));

router.get('/:code/analysis', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const queryDate = typeof req.query.date === 'string' ? req.query.date : undefined;

  const dailyBasicData = await stockRepo.getLatestDailyBasic(code, queryDate);

  const calculatedIndicators = await stockRepo.getCalculatedIndicators(code);

  const analysisData = {
    indicators: {
      ...(dailyBasicData || {}),
      ...(calculatedIndicators || {})
    }
  };

  sendSuccess(res, analysisData);
}));

export default router;
