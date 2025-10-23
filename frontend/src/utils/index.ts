/**
 * 工具函数统一导出
 * 提供便捷的导入方式
 */

// 格式化工具
export {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatLargeNumber,
  formatVolume,
  formatMarketCap,
  formatDate,
  formatDateTime,
  formatStockCode,
  parseNumber,
  getChangeColorClass,
  getChangeColorStyle
} from './format';

// 验证工具
export {
  isValidStockCode,
  isValidExchange,
  isValidDateString,
  isValidDateRange,
  isInRange,
  isValidPercent,
  isPositiveInteger,
  isNonNegative,
  isEmptyParams,
  isValidPhone,
  isValidEmail,
  isValidUrl,
  isValidLength,
  isWeekday,
  isPossibleTradingDay,
  isValidSignalStrength,
  isValidPagination,
  isValidSortField,
  isValidSortOrder
} from './validators';

// 存储工具
export {
  storage,
  StorageKey,
  setItem,
  getItem,
  removeItem,
  clearStorage,
  hasItem,
  setCache,
  getCache,
  clearCache,
  clearExpiredCache
} from './storage';

// 常量
export {
  EXCHANGES,
  EXCHANGE_NAMES,
  BOARDS,
  BOARD_NAMES,
  SIGNAL_TYPES,
  SIGNAL_STRENGTH,
  KLINE_PERIODS,
  KLINE_PERIOD_NAMES,
  INDICATORS,
  MA_PERIODS,
  SORT_ORDERS,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  TIME_RANGES,
  TIME_RANGE_NAMES,
  CHANGE_THRESHOLDS,
  VOLUME_RATIO_THRESHOLDS,
  REFRESH_INTERVALS,
  CACHE_EXPIRY,
  REQUEST_TIMEOUT,
  WS_STATUS,
  WS_EVENT_TYPES,
  MESSAGE_DURATION,
  COLORS,
  DATE_FORMATS,
  REGEX,
  STORAGE_PREFIX,
  APP_VERSION,
  APP_NAME,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME
} from './constants';
