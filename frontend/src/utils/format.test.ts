/**
 * 格式化工具函数测试
 */

import { describe, it, expect } from 'vitest';
import {
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
  getChangeColorStyle
} from './format';

describe('formatNumber', () => {
  it('应该正确格式化数字', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
    expect(formatNumber(1234567.89)).toBe('1,234,567.89');
  });

  it('应该处理小数位数', () => {
    expect(formatNumber(1234.5678, 3)).toBe('1,234.568');
    expect(formatNumber(1234.5, 0)).toBe('1,235');
  });

  it('应该处理边界情况', () => {
    expect(formatNumber(0)).toBe('0.00');
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber('')).toBe('-');
  });

  it('应该处理字符串输入', () => {
    expect(formatNumber('1234.56')).toBe('1,234.56');
    expect(formatNumber('invalid')).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('应该正确格式化货币', () => {
    expect(formatCurrency(1234.56)).toBe('¥1,234.56');
    expect(formatCurrency(1000000)).toBe('¥1,000,000.00');
  });

  it('应该处理边界情况', () => {
    expect(formatCurrency(0)).toBe('¥0.00');
    expect(formatCurrency(null)).toBe('-');
  });
});

describe('formatPercent', () => {
  it('应该正确格式化百分比', () => {
    expect(formatPercent(12.34)).toBe('+12.34%');
    expect(formatPercent(-5.67)).toBe('-5.67%');
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('应该支持不显示符号', () => {
    expect(formatPercent(12.34, 2, false)).toBe('12.34%');
    expect(formatPercent(-5.67, 2, false)).toBe('-5.67%');
  });

  it('应该处理边界情况', () => {
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent(undefined)).toBe('-');
  });
});

describe('formatLargeNumber', () => {
  it('应该正确转换为万', () => {
    expect(formatLargeNumber(50000)).toBe('5.00万');
    expect(formatLargeNumber(123456)).toBe('12.35万');
  });

  it('应该正确转换为亿', () => {
    expect(formatLargeNumber(500000000)).toBe('5.00亿');
    expect(formatLargeNumber(1234567890)).toBe('12.35亿');
  });

  it('应该不转换小数字', () => {
    expect(formatLargeNumber(5000)).toBe('5,000.00');
    expect(formatLargeNumber(999)).toBe('999.00');
  });

  it('应该处理边界情况', () => {
    expect(formatLargeNumber(0)).toBe('0.00');
    expect(formatLargeNumber(null)).toBe('-');
  });
});

describe('formatVolume', () => {
  it('应该正确格式化成交量', () => {
    expect(formatVolume(50000)).toBe('5.00万');
    expect(formatVolume(500000000)).toBe('5.00亿');
  });
});

describe('formatMarketCap', () => {
  it('应该正确格式化市值', () => {
    expect(formatMarketCap(50000000)).toBe('¥5,000.00万');
    expect(formatMarketCap(5000000000)).toBe('¥50.00亿');
  });

  it('应该处理边界情况', () => {
    expect(formatMarketCap(null)).toBe('-');
    expect(formatMarketCap(undefined)).toBe('-');
  });
});

describe('formatDate', () => {
  it('应该正确格式化日期', () => {
    const date = new Date('2025-10-22T12:00:00');
    expect(formatDate(date)).toBe('2025-10-22');
    expect(formatDate(date, 'YYYY-MM-DD HH:mm:ss')).toMatch(/2025-10-22 \d{2}:\d{2}:\d{2}/);
  });

  it('应该处理字符串输入', () => {
    expect(formatDate('2025-10-22')).toBe('2025-10-22');
  });

  it('应该处理边界情况', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('invalid')).toBe('-');
  });
});

describe('formatDateTime', () => {
  it('应该正确格式化日期时间', () => {
    const date = new Date('2025-10-22T12:30:45');
    const formatted = formatDateTime(date);
    expect(formatted).toMatch(/2025-10-22 \d{2}:\d{2}:\d{2}/);
  });
});

describe('formatStockCode', () => {
  it('应该正确添加交易所前缀', () => {
    expect(formatStockCode('000001', 'SZ')).toBe('SZ.000001');
    expect(formatStockCode('600000', 'SH')).toBe('SH.600000');
  });

  it('应该自动判断交易所', () => {
    expect(formatStockCode('600000')).toBe('SH.600000');
    expect(formatStockCode('000001')).toBe('SZ.000001');
    expect(formatStockCode('300001')).toBe('SZ.300001');
  });

  it('应该处理边界情况', () => {
    expect(formatStockCode('')).toBe('-');
    expect(formatStockCode('999999')).toBe('999999');
  });
});

describe('parseNumber', () => {
  it('应该正确解析格式化的数字', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('¥1,000.00')).toBe(1000);
    expect(parseNumber('+5.5%')).toBe(5.5);
  });

  it('应该正确处理单位', () => {
    expect(parseNumber('5.00万')).toBe(50000);
    expect(parseNumber('5.00亿')).toBe(500000000);
  });

  it('应该处理数字类型输入', () => {
    expect(parseNumber(1234.56)).toBe(1234.56);
    expect(parseNumber(0)).toBe(0);
  });

  it('应该处理边界情况', () => {
    expect(parseNumber('invalid')).toBe(0);
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
  });
});

describe('getChangeColorStyle', () => {
  it('应该返回正确的涨颜色', () => {
    const style = getChangeColorStyle(5.5);
    expect(style.color).toBe('var(--sq-rise)');
  });

  it('应该返回正确的跌颜色', () => {
    const style = getChangeColorStyle(-3.2);
    expect(style.color).toBe('var(--sq-fall)');
  });

  it('应该返回正确的平盘颜色', () => {
    const style = getChangeColorStyle(0);
    expect(style.color).toBe('var(--sq-neutral)');
  });

  it('应该处理边界情况', () => {
    const style1 = getChangeColorStyle(null);
    expect(style1.color).toBe('var(--sq-text-tertiary)');

    const style2 = getChangeColorStyle(undefined);
    expect(style2.color).toBe('var(--sq-text-tertiary)');
  });
});
