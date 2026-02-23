import express from 'express';
import { AnalysisRepository } from '../repositories';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';

const router = express.Router();
const analysisRepo = new AnalysisRepository();

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Get home dashboard data - aggregates all metrics needed for the Home page
 * GET /api/home/dashboard
 */
router.get('/dashboard', asyncHandler(async (_req, res) => {
  const marketOverview = await analysisRepo.getMarketOverview();
  const todaySignals = marketOverview.buySignalsToday;
  const yesterdaySignals = await analysisRepo.getYesterdaySignalCount();

  const signalChange = todaySignals - yesterdaySignals;
  const signalChangePercent = yesterdaySignals > 0
    ? Math.round((signalChange / yesterdaySignals) * 1000) / 10
    : null;

  const hotSectors = await analysisRepo.getHotSectorStocks(1, 5);

  let totalTurnover: number | null = null;
  let turnoverChange: number | null = null;
  try {
    const turnoverSummary = await analysisRepo.getTurnoverSummary();
    const dbTodayTurnover = turnoverSummary.todayTurnover;
    const dbPreviousTurnover = turnoverSummary.previousTurnover;

    if (dbTodayTurnover !== null && dbTodayTurnover > 0) {
      totalTurnover = dbTodayTurnover;
    }
    if (
      totalTurnover !== null &&
      dbPreviousTurnover !== null &&
      dbPreviousTurnover > 0
    ) {
      turnoverChange = Math.round(((totalTurnover - dbPreviousTurnover) / dbPreviousTurnover) * 1000) / 10;
    }
  } catch (error) {
    console.error('Error fetching turnover data:', error);
  }

  let marketSentiment: string | null = null;
  let sentimentScore: number | null = null;
  if (marketOverview.totalStocks > 0) {
    const upRatio = marketOverview.upCount / marketOverview.totalStocks;
    if (upRatio > 0.7) {
      marketSentiment = '贪婪';
      sentimentScore = Math.round(50 + (upRatio - 0.5) * 100);
    } else if (upRatio > 0.55) {
      marketSentiment = '乐观';
      sentimentScore = Math.round(50 + (upRatio - 0.5) * 100);
    } else if (upRatio < 0.3) {
      marketSentiment = '恐慌';
      sentimentScore = Math.round(upRatio * 100);
    } else if (upRatio < 0.45) {
      marketSentiment = '悲观';
      sentimentScore = Math.round(upRatio * 100);
    } else {
      marketSentiment = '中性';
      sentimentScore = 50;
    }

    sentimentScore = Math.max(0, Math.min(100, sentimentScore));
  }

  const last7DaysSignals = await analysisRepo.getBuySignals(7);
  let winRate: number | null = null;
  if (last7DaysSignals.length > 0) {
    winRate = Math.round(
      (last7DaysSignals.filter((signal: any) => signal.confidence > 0.7).length / last7DaysSignals.length) * 1000
    ) / 10;
  }

  const formattedHotSectors = hotSectors.map((item: any) => {
    const sectorPctChange = toFiniteNumber(item.sector_pct_change);
    const sectorMoneyFlow = toFiniteNumber(item.sector_money_flow);

    return {
      sector: item.sector_name || '暂无数据',
      isHot: true,
      changePct:
        sectorPctChange === null
          ? '暂无数据'
          : `${sectorPctChange >= 0 ? '+' : ''}${sectorPctChange.toFixed(1)}%`,
      netInflow:
        sectorMoneyFlow === null
          ? '暂无数据'
          : `${sectorMoneyFlow >= 0 ? '+' : '-'}${Math.abs(sectorMoneyFlow / 100000000).toFixed(1)}亿`,
      leaderName: item.stock_name || '暂无数据',
      leaderCode: item.stock_code || '暂无数据',
    };
  });

  const dashboardData = {
    platform: {
      totalStocks: marketOverview.totalStocks,
      dataAccuracy: null as number | null,
      responseTime: null as string | null,
    },
    market: {
      totalStocks: marketOverview.totalStocks,
      upCount: marketOverview.upCount,
      downCount: marketOverview.downCount,
      flatCount: marketOverview.flatCount,
      sentiment: marketSentiment,
      sentimentScore,
      totalTurnover,
      turnoverChange,
    },
    today: {
      selectedStocks: todaySignals,
      selectedChange: signalChange,
      selectedChangePercent: signalChangePercent,
      winRate,
      volumeSurges: marketOverview.volumeSurgeCount,
    },
    hotSectors: formattedHotSectors,
    strategy: {
      totalReturn: null as number | null,
      todayReturn: null as number | null,
      annualReturn: null as number | null,
      maxDrawdown: null as number | null,
      sharpeRatio: null as number | null,
      winRate,
    },
    meta: {
      timestamp: new Date().toISOString(),
      dataSource: 'database',
    },
  };

  sendSuccess(res, dashboardData);
}));

export default router;
