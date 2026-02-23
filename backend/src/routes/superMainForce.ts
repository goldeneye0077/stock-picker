import express from 'express';
import { AnalysisRepository } from '../repositories';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';

const router = express.Router();
const analysisRepo = new AnalysisRepository();

function shiftDate(date: string, days: number): string {
  const dateObj = new Date(`${date}T00:00:00.000Z`);
  dateObj.setUTCDate(dateObj.getUTCDate() + days);
  return dateObj.toISOString().split('T')[0];
}

/**
 * Get super main force monthly statistics
 * GET /api/analysis/super-main-force/monthly
 */
router.get('/monthly', asyncHandler(async (_req, res) => {
  const hasSuperMainForceTable = await analysisRepo.hasSuperMainForceTable();

  let tradeDate: string | null = null;
  if (hasSuperMainForceTable) {
    tradeDate = await analysisRepo.getLatestSuperMainForceTradeDate();
  }

  if (!tradeDate) {
    tradeDate = await analysisRepo.getLatestQuoteTradeDate();
  }

  const startDate = tradeDate ? shiftDate(tradeDate, -29) : null;
  const endDate = tradeDate;

  let selectedCount: number | null = null;
  let limitUpCount: number | null = null;
  let limitUpRate: number | null = null;
  let marketLimitUpRate: number | null = null;
  let statsDays: number | null = null;
  let weeklyComparison: Array<{
    date: string;
    selectedCount: number;
    limitUpCount: number;
    hitRate: number;
  }> = [];

  if (hasSuperMainForceTable && startDate && endDate) {
    const stats = await analysisRepo.getSuperMainForcePeriodStats(startDate, endDate);
    const selectedCountRaw = stats.selectedCount;
    const limitUpCountRaw = stats.limitUpCount;
    const statsDaysRaw = stats.statsDays;
    statsDays = statsDaysRaw > 0 ? statsDaysRaw : null;

    if (statsDays !== null) {
      selectedCount = selectedCountRaw;
      limitUpCount = limitUpCountRaw;
      limitUpRate = selectedCountRaw > 0
        ? Math.round((limitUpCountRaw / selectedCountRaw) * 1000) / 10
        : null;
    }

    weeklyComparison = await analysisRepo.getSuperMainForceWeeklyComparison(startDate, endDate);
  }

  if (tradeDate) {
    const marketLimitUpSnapshot = await analysisRepo.getMarketLimitUpSnapshot(tradeDate);
    if (marketLimitUpSnapshot && marketLimitUpSnapshot.count > 0) {
      marketLimitUpRate = Math.round((marketLimitUpSnapshot.limitUp / marketLimitUpSnapshot.count) * 1000) / 10;
    }
  }

  const difference = limitUpRate !== null && marketLimitUpRate !== null
    ? Math.round((limitUpRate - marketLimitUpRate) * 10) / 10
    : null;

  sendSuccess(res, {
    tradeDate,
    period: {
      start: startDate,
      end: endDate,
      days: statsDays,
    },
    statistics: {
      selectedCount,
      limitUpCount,
      limitUpRate,
      marketLimitUpRate,
      comparison: {
        superMainForce: limitUpRate,
        market: marketLimitUpRate,
        difference,
      },
    },
    medals: {
      gold: null,
      silver: null,
      bronze: null,
    },
    weeklyComparison,
  });
}));

export default router;
