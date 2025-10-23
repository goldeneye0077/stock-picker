/**
 * 格式化工具函数
 * 提供数字、日期、货币等常用格式化功能
 */

/**
 * 格式化数字为千分位显示
 * @param value 数字值
 * @param decimals 小数位数，默认2位
 * @returns 格式化后的字符串
 */
export function formatNumber(value: number | string | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '-';
  }

  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * 格式化货币金额
 * @param value 金额值
 * @param decimals 小数位数，默认2位
 * @returns 格式化后的货币字符串
 */
export function formatCurrency(value: number | string | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '-';
  }

  return `¥${formatNumber(num, decimals)}`;
}

/**
 * 格式化百分比
 * @param value 百分比值（如 2.5 表示 2.5%）
 * @param decimals 小数位数，默认2位
 * @param withSign 是否显示正负号，默认true
 * @returns 格式化后的百分比字符串
 */
export function formatPercent(
  value: number | string | null | undefined,
  decimals: number = 2,
  withSign: boolean = true
): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '-';
  }

  const sign = withSign && num > 0 ? '+' : '';
  return `${sign}${formatNumber(num, decimals)}%`;
}

/**
 * 格式化大数字（自动转换为万、亿单位）
 * @param value 数字值
 * @param decimals 小数位数，默认2位
 * @returns 格式化后的字符串
 */
export function formatLargeNumber(value: number | string | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '-';
  }

  if (num >= 100000000) {
    // 亿
    return `${formatNumber(num / 100000000, decimals)}亿`;
  } else if (num >= 10000) {
    // 万
    return `${formatNumber(num / 10000, decimals)}万`;
  } else {
    return formatNumber(num, decimals);
  }
}

/**
 * 格式化成交量
 * @param value 成交量值
 * @returns 格式化后的字符串
 */
export function formatVolume(value: number | string | null | undefined): string {
  return formatLargeNumber(value, 2);
}

/**
 * 格式化市值
 * @param value 市值
 * @returns 格式化后的字符串
 */
export function formatMarketCap(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '-';
  }

  return `¥${formatLargeNumber(num, 2)}`;
}

/**
 * 格式化日期
 * @param date 日期对象或字符串
 * @param format 格式模板，默认 'YYYY-MM-DD'
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date | string | null | undefined, format: string = 'YYYY-MM-DD'): string {
  if (!date) {
    return '-';
  }

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '-';
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化日期时间
 * @param date 日期对象或字符串
 * @returns 格式化后的日期时间字符串
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, 'YYYY-MM-DD HH:mm:ss');
}

/**
 * 格式化股票代码（添加交易所前缀）
 * @param code 股票代码
 * @param exchange 交易所（SH/SZ）
 * @returns 格式化后的股票代码
 */
export function formatStockCode(code: string, exchange?: string): string {
  if (!code) {
    return '-';
  }

  if (exchange) {
    return `${exchange}.${code}`;
  }

  // 自动判断交易所
  if (code.startsWith('6')) {
    return `SH.${code}`;
  } else if (code.startsWith('0') || code.startsWith('3')) {
    return `SZ.${code}`;
  }

  return code;
}

/**
 * 解析数字（清除格式化字符）
 * @param value 格式化的数字字符串
 * @returns 数字值
 */
export function parseNumber(value: any): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    // 清除所有格式化字符：¥ + % 亿 万 ,
    const cleaned = value.replace(/[¥+%亿万,]/g, '');
    const num = parseFloat(cleaned);

    // 处理单位
    if (value.includes('亿')) {
      return num * 100000000;
    } else if (value.includes('万')) {
      return num * 10000;
    }

    return isNaN(num) ? 0 : num;
  }

  return 0;
}

/**
 * 格式化涨跌幅颜色类名
 * @param value 涨跌幅值
 * @returns CSS 类名
 */
export function getChangeColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value > 0) {
    return 'text-red';
  } else if (value < 0) {
    return 'text-green';
  }

  return 'text-gray';
}

/**
 * 格式化涨跌幅样式对象
 * @param value 涨跌幅值
 * @returns React style 对象
 */
export function getChangeColorStyle(value: number | null | undefined): React.CSSProperties {
  if (value === null || value === undefined) {
    return { color: '#666' };
  }

  if (value > 0) {
    return { color: '#cf1322' }; // 涨 - 红色
  } else if (value < 0) {
    return { color: '#3f8600' }; // 跌 - 绿色
  }

  return { color: '#666' }; // 平 - 灰色
}
