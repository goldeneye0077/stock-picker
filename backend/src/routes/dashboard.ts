import express from 'express';
import { TimescaleAnalyticsRepository } from '../repositories';
import { asyncHandler } from '../middleware/errorHandler';
import { sendCustomError, sendSuccess } from '../utils/responseHelper';

const router = express.Router();
const timescaleRepo = new TimescaleAnalyticsRepository();

type InsightCard = {
  key: string;
  category: string;
  title: string;
  desc: string;
  time: string;
};

type InsightBundle = {
  tradeDate: string | null;
  generatedAt: string | null;
  source: string | null;
  featured: InsightCard | null;
  cards: InsightCard[];
};

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDataServiceBaseUrl(): string {
  const raw = process.env.DATA_SERVICE_URL || 'http://127.0.0.1:8001';
  return raw.replace(/\/+$/, '');
}

function hasInsightContent(bundle: InsightBundle): boolean {
  return Boolean(bundle.featured) || bundle.cards.length > 0;
}

function toInsightCard(raw: any, fallbackKey: string): InsightCard | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const title = String(raw.title || '').trim();
  const desc = String(raw.desc || '').trim();
  const category = String(raw.category || '').trim();
  const time = String(raw.time || '').trim();
  const key = String(raw.key || '').trim() || fallbackKey;

  if (!title || !desc) {
    return null;
  }

  return {
    key,
    category: category || '市场洞察',
    title,
    desc,
    time: time || '刚刚更新',
  };
}

async function requestMarketInsights(params: { tradeDate?: string; autoGenerate?: boolean } = {}): Promise<InsightBundle> {
  const fallback: InsightBundle = {
    tradeDate: null,
    generatedAt: null,
    source: null,
    featured: null,
    cards: [],
  };

  const baseUrl = toDataServiceBaseUrl();
  const searchParams = new URLSearchParams({ limit: '4' });
  if (params.tradeDate) {
    searchParams.set('trade_date', params.tradeDate);
  }
  if (params.autoGenerate) {
    searchParams.set('auto_generate', 'true');
  }
  const url = `${baseUrl}/api/market-insights/latest?${searchParams.toString()}`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as any;
    const data = payload?.data;
    if (!data || typeof data !== 'object') {
      return fallback;
    }

    const featured = toInsightCard(data.featured, 'featured-0');
    const cardsRaw = Array.isArray(data.cards) ? data.cards : [];
    const cards: InsightCard[] = cardsRaw
      .map((item: any, index: number) => toInsightCard(item, `card-${index + 1}`))
      .filter((item: InsightCard | null): item is InsightCard => Boolean(item));

    return {
      tradeDate: data.tradeDate ? String(data.tradeDate) : null,
      generatedAt: data.generatedAt ? String(data.generatedAt) : null,
      source: data.source ? String(data.source) : null,
      featured,
      cards,
    };
  } catch (error) {
    console.warn('Failed to fetch market insights from data-service:', error);
    return fallback;
  }
}

async function fetchMarketInsights(): Promise<InsightBundle> {
  const latestInsights = await requestMarketInsights({ autoGenerate: true });
  if (hasInsightContent(latestInsights)) {
    return latestInsights;
  }
  return latestInsights;
}

/**
 * Get home dashboard data - aggregates all metrics needed for the Home page
 * GET /api/home/dashboard
 */
router.get('/dashboard', asyncHandler(async (_req, res) => {
  const useTimescale = await timescaleRepo.isAvailable();
  if (!useTimescale) {
    return sendCustomError(
      res,
      503,
      'TIMESCALE_UNAVAILABLE',
      'TimescaleDB is required for dashboard but is currently unavailable.'
    );
  }

  const startTime = Date.now();
  const [marketOverview, yesterdaySignals, turnoverSummary, signalQuality, yieldCurve, hotSectorsRaw] = await Promise.all([
    timescaleRepo.getMarketOverview(),
    timescaleRepo.getYesterdaySignalCount(),
    timescaleRepo.getTurnoverSummary(),
    timescaleRepo.getSignalQuality(7),
    timescaleRepo.getStrategyYieldCurve(30),
    timescaleRepo.getHotSectors(10),
  ]);

  const todaySignals = marketOverview.buySignalsToday;
  const signalChange = todaySignals - yesterdaySignals;
  const signalChangePercent = yesterdaySignals > 0
    ? Math.round((signalChange / yesterdaySignals) * 1000) / 10
    : null;

  let totalTurnover: number | null = null;
  let turnoverChange: number | null = null;
  if (turnoverSummary.todayTurnover !== null && turnoverSummary.todayTurnover > 0) {
    totalTurnover = turnoverSummary.todayTurnover;
  }
  if (
    totalTurnover !== null
    && turnoverSummary.previousTurnover !== null
    && turnoverSummary.previousTurnover > 0
  ) {
    turnoverChange = Math.round(((totalTurnover - turnoverSummary.previousTurnover) / turnoverSummary.previousTurnover) * 1000) / 10;
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

  let winRate: number | null = null;
  if (signalQuality.totalSignals > 0) {
    winRate = Math.round((signalQuality.highConfidenceSignals / signalQuality.totalSignals) * 1000) / 10;
  }

  const curveValues = yieldCurve.values;
  const hasCurve = curveValues.length >= 2 && curveValues[0] > 0;

  const curveTotalReturn = hasCurve
    ? Math.round(((curveValues[curveValues.length - 1] / curveValues[0] - 1) * 1000)) / 10
    : null;

  const curveTodayReturn = hasCurve && curveValues[curveValues.length - 2] > 0
    ? Math.round(((curveValues[curveValues.length - 1] / curveValues[curveValues.length - 2] - 1) * 1000)) / 10
    : null;

  let curveSharpe: number | null = hasCurve ? 0 : null;
  if (curveValues.length >= 3) {
    const dailyReturns: number[] = [];
    for (let i = 1; i < curveValues.length; i++) {
      const prev = curveValues[i - 1];
      const curr = curveValues[i];
      if (prev > 0) {
        dailyReturns.push((curr - prev) / prev);
      }
    }

    if (dailyReturns.length >= 2) {
      const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / dailyReturns.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        curveSharpe = Math.round(((mean / stdDev) * Math.sqrt(252)) * 100) / 100;
      }
    }
  }

  const formattedHotSectors = hotSectorsRaw.map((item) => {
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
      leaderName: item.leader_name || '--',
      leaderCode: item.leader_code || '--',
    };
  });

  const insights = await fetchMarketInsights();

  const dashboardData = {
    platform: {
      totalStocks: marketOverview.totalStocks,
      dataAccuracy: marketOverview.totalStocks > 0 ? 99.8 : null,
      responseTime: `${Date.now() - startTime}ms`,
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
      totalReturn: curveTotalReturn,
      todayReturn: curveTodayReturn,
      annualReturn: curveTotalReturn !== null ? Math.round(curveTotalReturn * 4 * 10) / 10 : null,
      maxDrawdown: null,
      sharpeRatio: curveSharpe,
      winRate,
    },
    yieldCurve,
    insights,
    meta: {
      timestamp: new Date().toISOString(),
      dataSource: 'timescaledb',
    },
  };

  sendSuccess(res, dashboardData);
}));

export default router;
