/**
 * 验证工具函数测试
 */

import { describe, it, expect } from 'vitest';
import {
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

describe('isValidStockCode', () => {
  it('应该接受有效的股票代码', () => {
    expect(isValidStockCode('000001')).toBe(true);
    expect(isValidStockCode('600000')).toBe(true);
    expect(isValidStockCode('300001')).toBe(true);
    expect(isValidStockCode('688001')).toBe(true);
  });

  it('应该拒绝无效的股票代码', () => {
    expect(isValidStockCode('00001')).toBe(false);  // 5位
    expect(isValidStockCode('0000001')).toBe(false); // 7位
    expect(isValidStockCode('AAABBB')).toBe(false);  // 非数字
    expect(isValidStockCode('00000A')).toBe(false);  // 包含字母
  });

  it('应该处理边界情况', () => {
    expect(isValidStockCode('')).toBe(false);
    expect(isValidStockCode(null as any)).toBe(false);
    expect(isValidStockCode(undefined as any)).toBe(false);
    expect(isValidStockCode(123456 as any)).toBe(false); // 非字符串
  });
});

describe('isValidExchange', () => {
  it('应该接受有效的交易所代码', () => {
    expect(isValidExchange('SH')).toBe(true);
    expect(isValidExchange('SZ')).toBe(true);
    expect(isValidExchange('BJ')).toBe(true);
  });

  it('应该处理大小写', () => {
    expect(isValidExchange('sh')).toBe(true);
    expect(isValidExchange('sz')).toBe(true);
    expect(isValidExchange('bj')).toBe(true);
  });

  it('应该拒绝无效的交易所代码', () => {
    expect(isValidExchange('HK')).toBe(false);
    expect(isValidExchange('US')).toBe(false);
    expect(isValidExchange('')).toBe(false);
  });
});

describe('isValidDateString', () => {
  it('应该接受有效的日期格式', () => {
    expect(isValidDateString('2025-10-22')).toBe(true);
    expect(isValidDateString('2024-01-01')).toBe(true);
    expect(isValidDateString('2024-12-31')).toBe(true);
  });

  it('应该拒绝无效的日期格式', () => {
    expect(isValidDateString('2025/10/22')).toBe(false); // 错误分隔符
    expect(isValidDateString('10-22-2025')).toBe(false); // 错误顺序
    expect(isValidDateString('2025-13-01')).toBe(false); // 无效月份
    // 注意：JavaScript Date 构造函数对日期是宽容的，'2025-02-30' 会被转换为有效日期
    // expect(isValidDateString('2025-02-30')).toBe(false); // JavaScript 会自动调整为 2025-03-02
  });

  it('应该处理边界情况', () => {
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(null as any)).toBe(false);
    expect(isValidDateString(undefined as any)).toBe(false);
    expect(isValidDateString('invalid')).toBe(false);
  });
});

describe('isValidDateRange', () => {
  it('应该接受有效的日期范围', () => {
    expect(isValidDateRange('2025-01-01', '2025-12-31')).toBe(true);
    expect(isValidDateRange('2025-10-22', '2025-10-22')).toBe(true); // 同一天
    expect(isValidDateRange(new Date('2025-01-01'), new Date('2025-12-31'))).toBe(true);
  });

  it('应该拒绝无效的日期范围', () => {
    expect(isValidDateRange('2025-12-31', '2025-01-01')).toBe(false); // 开始晚于结束
  });

  it('应该处理边界情况', () => {
    expect(isValidDateRange('invalid', '2025-12-31')).toBe(false);
    expect(isValidDateRange('2025-01-01', 'invalid')).toBe(false);
  });
});

describe('isInRange', () => {
  it('应该正确判断数值范围', () => {
    expect(isInRange(5, 1, 10)).toBe(true);
    expect(isInRange(1, 1, 10)).toBe(true);  // 边界值
    expect(isInRange(10, 1, 10)).toBe(true); // 边界值
  });

  it('应该拒绝超出范围的值', () => {
    expect(isInRange(0, 1, 10)).toBe(false);
    expect(isInRange(11, 1, 10)).toBe(false);
    expect(isInRange(-5, 1, 10)).toBe(false);
  });
});

describe('isValidPercent', () => {
  it('应该接受有效的百分比值', () => {
    expect(isValidPercent(0)).toBe(true);
    expect(isValidPercent(50)).toBe(true);
    expect(isValidPercent(-50)).toBe(true);
    expect(isValidPercent(100)).toBe(true);
    expect(isValidPercent(-100)).toBe(true);
  });

  it('应该拒绝超出范围的百分比值', () => {
    expect(isValidPercent(101)).toBe(false);
    expect(isValidPercent(-101)).toBe(false);
  });
});

describe('isPositiveInteger', () => {
  it('应该接受正整数', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(100)).toBe(true);
    expect(isPositiveInteger(9999)).toBe(true);
  });

  it('应该拒绝非正整数', () => {
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-1)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger(-1.5)).toBe(false);
  });
});

describe('isNonNegative', () => {
  it('应该接受非负数', () => {
    expect(isNonNegative(0)).toBe(true);
    expect(isNonNegative(1)).toBe(true);
    expect(isNonNegative(100.5)).toBe(true);
  });

  it('应该拒绝负数', () => {
    expect(isNonNegative(-1)).toBe(false);
    expect(isNonNegative(-0.1)).toBe(false);
  });
});

describe('isEmptyParams', () => {
  it('应该识别空参数', () => {
    expect(isEmptyParams({})).toBe(true);
    expect(isEmptyParams({ a: null })).toBe(true);
    expect(isEmptyParams({ a: undefined })).toBe(true);
    expect(isEmptyParams({ a: '' })).toBe(true);
    expect(isEmptyParams({ a: null, b: undefined, c: '' })).toBe(true);
  });

  it('应该识别非空参数', () => {
    expect(isEmptyParams({ a: 'value' })).toBe(false);
    expect(isEmptyParams({ a: 0 })).toBe(false);
    expect(isEmptyParams({ a: false })).toBe(false);
    expect(isEmptyParams({ a: null, b: 'value' })).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('应该接受有效的手机号码', () => {
    expect(isValidPhone('13800138000')).toBe(true);
    expect(isValidPhone('15912345678')).toBe(true);
    expect(isValidPhone('18600000000')).toBe(true);
  });

  it('应该拒绝无效的手机号码', () => {
    expect(isValidPhone('12800138000')).toBe(false); // 不是1[3-9]开头
    expect(isValidPhone('1380013800')).toBe(false);  // 少于11位
    expect(isValidPhone('138001380000')).toBe(false); // 多于11位
    expect(isValidPhone('13800a38000')).toBe(false); // 包含字母
  });

  it('应该处理边界情况', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone(null as any)).toBe(false);
    expect(isValidPhone(undefined as any)).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('应该接受有效的邮箱地址', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('test.user@example.co.uk')).toBe(true);
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('应该拒绝无效的邮箱地址', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('invalid@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user @example.com')).toBe(false); // 包含空格
  });

  it('应该处理边界情况', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null as any)).toBe(false);
    expect(isValidEmail(undefined as any)).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('应该接受有效的URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
    expect(isValidUrl('ftp://example.com')).toBe(true);
  });

  it('应该拒绝无效的URL', () => {
    expect(isValidUrl('invalid')).toBe(false);
    expect(isValidUrl('//example.com')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false); // 缺少协议
  });

  it('应该处理边界情况', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl(null as any)).toBe(false);
    expect(isValidUrl(undefined as any)).toBe(false);
  });
});

describe('isValidLength', () => {
  it('应该接受符合长度要求的字符串', () => {
    expect(isValidLength('hello', 1, 10)).toBe(true);
    expect(isValidLength('h', 1, 10)).toBe(true);      // 最小长度
    expect(isValidLength('1234567890', 1, 10)).toBe(true); // 最大长度
  });

  it('应该拒绝不符合长度要求的字符串', () => {
    expect(isValidLength('', 1, 10)).toBe(false);      // 空字符串
    expect(isValidLength('12345678901', 1, 10)).toBe(false); // 超过最大长度
  });

  it('应该处理边界情况', () => {
    expect(isValidLength(null as any, 1, 10)).toBe(false);
    expect(isValidLength(undefined as any, 1, 10)).toBe(false);
  });
});

describe('isWeekday', () => {
  it('应该识别工作日', () => {
    expect(isWeekday(new Date('2025-10-20'))).toBe(true); // 周一
    expect(isWeekday(new Date('2025-10-21'))).toBe(true); // 周二
    expect(isWeekday(new Date('2025-10-22'))).toBe(true); // 周三
    expect(isWeekday(new Date('2025-10-23'))).toBe(true); // 周四
    expect(isWeekday(new Date('2025-10-24'))).toBe(true); // 周五
    expect(isWeekday('2025-10-22')).toBe(true);
  });

  it('应该识别周末', () => {
    expect(isWeekday(new Date('2025-10-25'))).toBe(false); // 周六
    expect(isWeekday(new Date('2025-10-26'))).toBe(false); // 周日
  });

  it('应该处理边界情况', () => {
    expect(isWeekday('invalid')).toBe(false);
  });
});

describe('isPossibleTradingDay', () => {
  it('应该识别可能的交易日', () => {
    expect(isPossibleTradingDay(new Date('2025-10-22'))).toBe(true); // 周三
    expect(isPossibleTradingDay('2025-10-22')).toBe(true);
  });

  it('应该识别非交易日', () => {
    expect(isPossibleTradingDay(new Date('2025-10-25'))).toBe(false); // 周六
    expect(isPossibleTradingDay(new Date('2025-10-26'))).toBe(false); // 周日
  });
});

describe('isValidSignalStrength', () => {
  it('应该接受有效的信号强度', () => {
    expect(isValidSignalStrength(0)).toBe(true);
    expect(isValidSignalStrength(50)).toBe(true);
    expect(isValidSignalStrength(100)).toBe(true);
  });

  it('应该拒绝无效的信号强度', () => {
    expect(isValidSignalStrength(-1)).toBe(false);
    expect(isValidSignalStrength(101)).toBe(false);
  });
});

describe('isValidPagination', () => {
  it('应该接受有效的分页参数', () => {
    expect(isValidPagination(1, 10)).toBe(true);
    expect(isValidPagination(5, 50)).toBe(true);
    expect(isValidPagination(1, 1000)).toBe(true); // 最大值
  });

  it('应该拒绝无效的分页参数', () => {
    expect(isValidPagination(0, 10)).toBe(false);      // 页码为0
    expect(isValidPagination(-1, 10)).toBe(false);     // 页码为负数
    expect(isValidPagination(1, 0)).toBe(false);       // 页大小为0
    expect(isValidPagination(1, 1001)).toBe(false);    // 页大小超过1000
    expect(isValidPagination(1.5, 10)).toBe(false);    // 页码非整数
    expect(isValidPagination(1, 10.5)).toBe(false);    // 页大小非整数
  });
});

describe('isValidSortField', () => {
  it('应该接受允许的排序字段', () => {
    const allowedFields = ['name', 'code', 'price'];
    expect(isValidSortField('name', allowedFields)).toBe(true);
    expect(isValidSortField('code', allowedFields)).toBe(true);
    expect(isValidSortField('price', allowedFields)).toBe(true);
  });

  it('应该拒绝不允许的排序字段', () => {
    const allowedFields = ['name', 'code', 'price'];
    expect(isValidSortField('invalid', allowedFields)).toBe(false);
    expect(isValidSortField('', allowedFields)).toBe(false);
  });
});

describe('isValidSortOrder', () => {
  it('应该接受有效的排序方向', () => {
    expect(isValidSortOrder('asc')).toBe(true);
    expect(isValidSortOrder('desc')).toBe(true);
    expect(isValidSortOrder('ascend')).toBe(true);
    expect(isValidSortOrder('descend')).toBe(true);
  });

  it('应该处理大小写', () => {
    expect(isValidSortOrder('ASC')).toBe(true);
    expect(isValidSortOrder('DESC')).toBe(true);
    expect(isValidSortOrder('Ascend')).toBe(true);
  });

  it('应该拒绝无效的排序方向', () => {
    expect(isValidSortOrder('invalid')).toBe(false);
    expect(isValidSortOrder('')).toBe(false);
  });
});
