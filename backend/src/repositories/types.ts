/**
 * Repository 层类型定义
 */

export interface Stock {
  code: string;
  name: string;
  exchange: string;
  industry?: string;
  list_date?: string;
  current_price?: number;
  pre_close?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
  change_percent?: number;
  change_amount?: number;
  quote_time?: string;
  quote_date?: string;
  volume_ratio?: number;
  is_volume_surge?: number;
  latest_signal?: string;
}

export interface KLine {
  id: number;
  stock_code: string;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  turnover_rate?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
}

export interface VolumeAnalysis {
  id: number;
  stock_code: string;
  date: string;
  volume_ratio: number;
  volume_ma5?: number;
  volume_ma10?: number;
  is_volume_surge: number;
  surge_days?: number;
  created_at?: string;
}

export interface BuySignal {
  id: number;
  stock_code: string;
  signal_type: string;
  signal_strength: number;
  price: number;
  description?: string;
  created_at: string;
}

export interface FundFlow {
  id: number;
  stock_code: string;
  date: string;
  main_fund_flow: number;
  retail_fund_flow: number;
  institutional_flow: number;
  large_order_ratio: number;
  created_at?: string;
}

export interface RealtimeQuote {
  stock_code: string;
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
  amount: number;
  pre_close: number;
  change_percent: number;
  change_amount: number;
  updated_at: string;
}

export interface StockDetails {
  stock: Stock;
  realtimeQuote?: RealtimeQuote;
  klines: KLine[];
  volumeAnalysis: VolumeAnalysis[];
  buySignals: BuySignal[];
  intradayQuotes?: any[];
}

export interface MarketOverview {
  totalStocks: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  volumeSurgeCount: number;
  buySignalsToday: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface DateRangeOptions {
  date_from?: string;
  date_to?: string;
  days?: number;
}
