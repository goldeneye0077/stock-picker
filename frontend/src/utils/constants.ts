/**
 * 应用常量定义
 * 集中管理整个应用的常量配置
 */

/**
 * 交易所代码
 */
export const EXCHANGES = {
  SH: 'SH',  // 上海证券交易所
  SZ: 'SZ',  // 深圳证券交易所
  BJ: 'BJ'   // 北京证券交易所
} as const;

/**
 * 交易所名称映射
 */
export const EXCHANGE_NAMES: Record<string, string> = {
  SH: '上海',
  SZ: '深圳',
  BJ: '北京'
};

/**
 * 板块类型
 */
export const BOARDS = {
  ALL: 'all',
  MAIN: 'main',
  SME: 'sme',
  STAR: 'star',
  BEIJING: 'beijing'
} as const;

/**
 * 板块名称映射
 */
export const BOARD_NAMES: Record<string, string> = {
  all: '全部',
  main: '主板',
  sme: '中小板',
  star: '创业板',
  beijing: '北交所'
};

/**
 * 信号类型
 */
export const SIGNAL_TYPES = {
  BUY: '买入',
  HOLD: '持有',
  WATCH: '观察',
  SELL: '卖出'
} as const;

/**
 * 信号强度等级
 */
export const SIGNAL_STRENGTH = {
  STRONG: { min: 80, max: 100, label: '强' },
  MODERATE: { min: 50, max: 79, label: '中' },
  WEAK: { min: 0, max: 49, label: '弱' }
} as const;

/**
 * K线周期
 */
export const KLINE_PERIODS = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  MINUTE_5: '5min',
  MINUTE_15: '15min',
  MINUTE_30: '30min',
  MINUTE_60: '60min'
} as const;

/**
 * K线周期名称映射
 */
export const KLINE_PERIOD_NAMES: Record<string, string> = {
  daily: '日K',
  weekly: '周K',
  monthly: '月K',
  '5min': '5分钟',
  '15min': '15分钟',
  '30min': '30分钟',
  '60min': '60分钟'
};

/**
 * 技术指标类型
 */
export const INDICATORS = {
  MA: 'ma',
  MACD: 'macd',
  KDJ: 'kdj',
  RSI: 'rsi',
  BOLL: 'boll',
  VOL: 'vol'
} as const;

/**
 * 移动平均线周期
 */
export const MA_PERIODS = [5, 10, 20, 30, 60, 120, 250] as const;

/**
 * 排序方向
 */
export const SORT_ORDERS = {
  ASC: 'ascend',
  DESC: 'descend'
} as const;

/**
 * 表格每页显示数量选项
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * 默认表格每页数量
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * 时间范围选项（天数）
 */
export const TIME_RANGES = {
  DAY_1: 1,
  DAY_3: 3,
  DAY_7: 7,
  DAY_15: 15,
  DAY_30: 30,
  DAY_60: 60,
  DAY_90: 90
} as const;

/**
 * 时间范围名称映射
 */
export const TIME_RANGE_NAMES: Record<number, string> = {
  1: '1天',
  3: '3天',
  7: '7天',
  15: '15天',
  30: '1个月',
  60: '2个月',
  90: '3个月'
};

/**
 * 涨跌幅阈值
 */
export const CHANGE_THRESHOLDS = {
  LIMIT_UP: 9.9,      // 涨停
  STRONG_UP: 5.0,     // 强势上涨
  UP: 0.0,            // 上涨
  FLAT: 0.0,          // 平盘
  DOWN: 0.0,          // 下跌
  STRONG_DOWN: -5.0,  // 强势下跌
  LIMIT_DOWN: -9.9    // 跌停
} as const;

/**
 * 成交量比阈值
 */
export const VOLUME_RATIO_THRESHOLDS = {
  HUGE: 5.0,      // 巨量
  LARGE: 2.0,     // 放量
  NORMAL: 0.8,    // 正常
  SHRINK: 0.5     // 缩量
} as const;

/**
 * 数据刷新间隔（毫秒）
 */
export const REFRESH_INTERVALS = {
  REALTIME: 5000,     // 实时数据 5秒
  FAST: 30000,        // 快速刷新 30秒
  NORMAL: 60000,      // 正常刷新 1分钟
  SLOW: 300000,       // 慢速刷新 5分钟
  DAILY: 86400000     // 每日刷新 24小时
} as const;

/**
 * 缓存过期时间（毫秒）
 */
export const CACHE_EXPIRY = {
  SHORT: 300000,      // 5分钟
  MEDIUM: 1800000,    // 30分钟
  LONG: 3600000,      // 1小时
  DAY: 86400000       // 24小时
} as const;

/**
 * API 请求超时时间（毫秒）
 */
export const REQUEST_TIMEOUT = {
  DEFAULT: 10000,     // 默认 10秒
  LONG: 30000,        // 长请求 30秒
  VERY_LONG: 60000    // 超长请求 1分钟
} as const;

/**
 * WebSocket 状态
 */
export const WS_STATUS = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
} as const;

/**
 * WebSocket 事件类型
 */
export const WS_EVENT_TYPES = {
  WELCOME: 'welcome',
  STOCK_UPDATE: 'stock_update',
  SIGNAL_UPDATE: 'signal_update',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong'
} as const;

/**
 * 消息提示持续时间（秒）
 */
export const MESSAGE_DURATION = {
  SHORT: 2,
  NORMAL: 3,
  LONG: 5
} as const;

/**
 * 颜色配置
 */
export const COLORS = {
  // 涨跌颜色
  UP: '#f53f3f',      // 涨 - 红色
  DOWN: '#00b578',    // 跌 - 绿色
  FLAT: '#666',       // 平 - 灰色

  // 主题色
  PRIMARY: '#1890ff',
  SUCCESS: '#52c41a',
  WARNING: '#faad14',
  ERROR: '#f5222d',
  INFO: '#1890ff',

  // 图表颜色
  CHART_COLORS: [
    '#5470c6',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#fc8452',
    '#9a60b4',
    '#ea7ccc'
  ]
} as const;

/**
 * A-share direction colors (rise=red, fall=green)
 */
export const A_SHARE_COLORS = {
  RISE: COLORS.UP,
  FALL: COLORS.DOWN
} as const;

/**
 * Date formats
 */
export const DATE_FORMATS = {
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  TIME: 'HH:mm:ss',
  MONTH: 'YYYY-MM',
  YEAR: 'YYYY'
} as const;

/**
 * 正则表达式
 */
export const REGEX = {
  STOCK_CODE: /^\d{6}$/,
  PHONE: /^1[3-9]\d{9}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  NUMBER: /^-?\d+(\.\d+)?$/,
  POSITIVE_INTEGER: /^[1-9]\d*$/
} as const;

/**
 * 本地存储键前缀
 */
export const STORAGE_PREFIX = 'stock_picker_' as const;

/**
 * 应用版本
 */
export const APP_VERSION = '1.0.0' as const;

/**
 * 应用名称
 */
export const APP_NAME = '智能选股系统' as const;

/**
 * 默认语言
 */
export const DEFAULT_LANGUAGE = 'zh-CN' as const;

/**
 * 默认主题
 */
export const DEFAULT_THEME = 'dark' as const;
