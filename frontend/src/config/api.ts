export const DATA_SERVICE_URL = (import.meta.env.VITE_DATA_SERVICE_URL as string | undefined) ?? 'http://127.0.0.1:8002';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DATA_SERVICE_URL;

export const API_ENDPOINTS = {
  STOCKS: '/api/stocks',
  ANALYSIS: '/api/analysis',
  SIGNALS: '/api/signals',
  DATA_COLLECTION: '/api/data',
  QUOTES: '/api/quotes',
  FUNDAMENTAL: '/api/fundamental',
};
