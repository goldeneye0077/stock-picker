export const DATA_SERVICE_URL = (import.meta.env.VITE_DATA_SERVICE_URL as string | undefined) || '/data-service';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export const API_ENDPOINTS = {
  STOCKS: '/api/stocks',
  ANALYSIS: '/api/analysis',
  SIGNALS: '/api/signals',
  DATA_COLLECTION: '/api/data',
  QUOTES: '/api/quotes',
  FUNDAMENTAL: '/api/fundamental',
  DASHBOARD: '/api/home',
};
