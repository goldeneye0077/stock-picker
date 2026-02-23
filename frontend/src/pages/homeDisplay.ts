import type { SuperMainForceMonthlyStats } from '../hooks/useSuperMainForceMonthlyStats';

export const NO_DATA_TEXT = '\u6682\u65e0\u6570\u636e';

export type MonthlySummary = {
  superRate: number | null;
  marketRate: number | null;
  multiplier: number | null;
  maxRate: number;
  periodText: string | null;
};

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const buildMonthlySummary = (
  monthlyStatsData: SuperMainForceMonthlyStats | null
): MonthlySummary => {
  const superRate =
    monthlyStatsData?.statistics?.comparison?.superMainForce ??
    monthlyStatsData?.statistics?.limitUpRate ??
    null;
  const marketRate =
    monthlyStatsData?.statistics?.comparison?.market ??
    monthlyStatsData?.statistics?.marketLimitUpRate ??
    null;
  const multiplier =
    superRate !== null && marketRate !== null && marketRate !== 0
      ? superRate / marketRate
      : null;
  const maxRate =
    superRate !== null && marketRate !== null
      ? Math.max(superRate, marketRate, 1)
      : 1;
  const periodText =
    monthlyStatsData?.period?.start && monthlyStatsData?.period?.end
      ? `${monthlyStatsData.period.start} ~ ${monthlyStatsData.period.end}`
      : null;

  return {
    superRate,
    marketRate,
    multiplier,
    maxRate,
    periodText,
  };
};

export const formatText = (value?: string | null) => {
  if (typeof value !== 'string') return NO_DATA_TEXT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : NO_DATA_TEXT;
};

export const formatNumber = (value?: number | null) => (
  isFiniteNumber(value) ? String(value) : NO_DATA_TEXT
);

export const formatPercent = (value?: number | null, digits = 1, withSign = false) => {
  if (!isFiniteNumber(value)) return NO_DATA_TEXT;
  return `${withSign ? (value >= 0 ? '+' : '') : ''}${value.toFixed(digits)}%`;
};

export const formatSignedNumber = (value?: number | null) => {
  if (!isFiniteNumber(value)) return NO_DATA_TEXT;
  return `${value >= 0 ? '+' : ''}${value}`;
};

export const formatScore = (value?: number | null) => (
  isFiniteNumber(value) ? `${value}/100` : NO_DATA_TEXT
);

export const formatTurnoverYi = (value?: number | null) => {
  if (!isFiniteNumber(value)) return NO_DATA_TEXT;
  return `${Math.round(value / 100000000).toLocaleString()}\u4ebf`;
};

export const formatDays = (value?: number | null) => (
  isFiniteNumber(value) && value > 0 ? `${value}\u5929` : NO_DATA_TEXT
);

export const formatSignedPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_DATA_TEXT;
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};
