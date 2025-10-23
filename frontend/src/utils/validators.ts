/**
 * 验证工具函数
 * 提供表单输入、数据格式等验证功能
 */

/**
 * 验证股票代码格式
 * @param code 股票代码
 * @returns 是否有效
 */
export function isValidStockCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // 6位数字
  const pattern = /^\d{6}$/;
  return pattern.test(code);
}

/**
 * 验证交易所代码
 * @param exchange 交易所代码
 * @returns 是否有效
 */
export function isValidExchange(exchange: string): boolean {
  return ['SH', 'SZ', 'BJ'].includes(exchange.toUpperCase());
}

/**
 * 验证日期格式（YYYY-MM-DD）
 * @param dateString 日期字符串
 * @returns 是否有效
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }

  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * 验证日期范围
 * @param startDate 开始日期
 * @param endDate 结束日期
 * @returns 是否有效（开始日期早于结束日期）
 */
export function isValidDateRange(startDate: string | Date, endDate: string | Date): boolean {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false;
  }

  return start <= end;
}

/**
 * 验证数字范围
 * @param value 数值
 * @param min 最小值
 * @param max 最大值
 * @returns 是否在范围内
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 验证百分比值
 * @param value 百分比值
 * @returns 是否有效（-100 到 100 之间）
 */
export function isValidPercent(value: number): boolean {
  return isInRange(value, -100, 100);
}

/**
 * 验证正整数
 * @param value 数值
 * @returns 是否为正整数
 */
export function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * 验证非负数
 * @param value 数值
 * @returns 是否为非负数
 */
export function isNonNegative(value: number): boolean {
  return value >= 0;
}

/**
 * 验证查询参数是否为空
 * @param params 参数对象
 * @returns 是否为空
 */
export function isEmptyParams(params: Record<string, any>): boolean {
  return Object.keys(params).length === 0 ||
    Object.values(params).every(v => v === null || v === undefined || v === '');
}

/**
 * 验证手机号码格式（中国）
 * @param phone 手机号码
 * @returns 是否有效
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  const pattern = /^1[3-9]\d{9}$/;
  return pattern.test(phone);
}

/**
 * 验证邮箱格式
 * @param email 邮箱地址
 * @returns 是否有效
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * 验证 URL 格式
 * @param url URL 字符串
 * @returns 是否有效
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证字符串长度范围
 * @param str 字符串
 * @param minLength 最小长度
 * @param maxLength 最大长度
 * @returns 是否在范围内
 */
export function isValidLength(str: string, minLength: number, maxLength: number): boolean {
  if (!str || typeof str !== 'string') {
    return false;
  }

  return str.length >= minLength && str.length <= maxLength;
}

/**
 * 验证是否为工作日（周一到周五）
 * @param date 日期
 * @returns 是否为工作日
 */
export function isWeekday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return false;
  }

  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/**
 * 验证是否为交易日（简单判断：工作日且非假日）
 * 注意：这里只做简单判断，实际交易日需要查询交易所日历
 * @param date 日期
 * @returns 是否可能为交易日
 */
export function isPossibleTradingDay(date: Date | string): boolean {
  return isWeekday(date);
}

/**
 * 验证信号强度值
 * @param strength 信号强度
 * @returns 是否有效（0-100之间）
 */
export function isValidSignalStrength(strength: number): boolean {
  return isInRange(strength, 0, 100);
}

/**
 * 验证分页参数
 * @param page 页码
 * @param pageSize 每页数量
 * @returns 是否有效
 */
export function isValidPagination(page: number, pageSize: number): boolean {
  return isPositiveInteger(page) && isPositiveInteger(pageSize) && pageSize <= 1000;
}

/**
 * 验证排序字段
 * @param field 字段名
 * @param allowedFields 允许的字段列表
 * @returns 是否有效
 */
export function isValidSortField(field: string, allowedFields: string[]): boolean {
  return allowedFields.includes(field);
}

/**
 * 验证排序方向
 * @param order 排序方向
 * @returns 是否有效
 */
export function isValidSortOrder(order: string): boolean {
  return ['asc', 'desc', 'ascend', 'descend'].includes(order.toLowerCase());
}
