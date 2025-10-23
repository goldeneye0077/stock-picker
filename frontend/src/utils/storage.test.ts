/**
 * 本地存储工具函数测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StorageKey,
  storage,
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

// Mock localStorage
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }

  // 用于测试的辅助方法
  _getStore(): Record<string, string> {
    return this.store;
  }
}

const localStorageMock = new LocalStorageMock();

// 替换全局 localStorage
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// 修复 Object.keys(localStorage) 返回正确的存储键
Object.defineProperty(global, 'localStorage', {
  value: new Proxy(localStorageMock, {
    ownKeys(target) {
      return Object.keys((target as LocalStorageMock)._getStore());
    },
    getOwnPropertyDescriptor(target, prop) {
      if (Object.keys((target as LocalStorageMock)._getStore()).includes(prop as string)) {
        return {
          configurable: true,
          enumerable: true,
        };
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    }
  }),
  writable: true
});

describe('Storage - 基本操作', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('set 和 get', () => {
    it('应该能够存储和读取字符串', () => {
      storage.set(StorageKey.THEME, 'dark');
      expect(storage.get(StorageKey.THEME)).toBe('dark');
    });

    it('应该能够存储和读取对象', () => {
      const obj = { name: '测试', value: 123 };
      storage.set(StorageKey.STOCK_LIST_FILTERS, obj);
      expect(storage.get(StorageKey.STOCK_LIST_FILTERS)).toEqual(obj);
    });

    it('应该能够存储和读取数组', () => {
      const arr = ['000001', '600000', '300001'];
      storage.set(StorageKey.FAVORITE_STOCKS, arr);
      expect(storage.get(StorageKey.FAVORITE_STOCKS)).toEqual(arr);
    });

    it('应该能够存储和读取布尔值', () => {
      storage.set('test_bool', true);
      expect(storage.get('test_bool')).toBe(true);
    });

    it('应该能够存储和读取数字', () => {
      storage.set(StorageKey.TABLE_PAGE_SIZE, 50);
      expect(storage.get(StorageKey.TABLE_PAGE_SIZE)).toBe(50);
    });

    it('不存在的键应该返回默认值', () => {
      expect(storage.get('non_existent', 'default')).toBe('default');
    });

    it('不存在的键且无默认值应该返回 undefined', () => {
      expect(storage.get('non_existent')).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('应该能够删除存储项', () => {
      storage.set(StorageKey.THEME, 'dark');
      expect(storage.has(StorageKey.THEME)).toBe(true);

      storage.remove(StorageKey.THEME);
      expect(storage.has(StorageKey.THEME)).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该能够清空所有存储', () => {
      storage.set(StorageKey.THEME, 'dark');
      storage.set(StorageKey.LANGUAGE, 'zh-CN');
      expect(storage.keys().length).toBeGreaterThan(0);

      storage.clear();
      expect(storage.keys().length).toBe(0);
    });
  });

  describe('has', () => {
    it('应该正确判断键是否存在', () => {
      expect(storage.has(StorageKey.THEME)).toBe(false);

      storage.set(StorageKey.THEME, 'dark');
      expect(storage.has(StorageKey.THEME)).toBe(true);

      storage.remove(StorageKey.THEME);
      expect(storage.has(StorageKey.THEME)).toBe(false);
    });
  });

  describe('keys', () => {
    it('应该返回所有键名', () => {
      localStorage.clear();
      storage.set(StorageKey.THEME, 'dark');
      storage.set(StorageKey.LANGUAGE, 'zh-CN');

      const keys = storage.keys();
      expect(keys).toContain(StorageKey.THEME);
      expect(keys).toContain(StorageKey.LANGUAGE);
      expect(keys.length).toBe(2);
    });
  });
});

describe('Storage - 缓存功能', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setCache 和 getCache', () => {
    it('应该能够设置和获取缓存', () => {
      const data = { test: 'value' };
      storage.setCache('test_key', data);

      const cached = storage.getCache('test_key');
      expect(cached).toEqual(data);
    });

    it('未过期的缓存应该可以获取', () => {
      const data = { test: 'value' };
      storage.setCache('test_key', data, 5000); // 5秒过期

      // 前进 2 秒
      vi.advanceTimersByTime(2000);

      const cached = storage.getCache('test_key');
      expect(cached).toEqual(data);
    });

    it('过期的缓存应该返回 undefined', () => {
      const data = { test: 'value' };
      storage.setCache('test_key', data, 5000); // 5秒过期

      // 前进 6 秒
      vi.advanceTimersByTime(6000);

      const cached = storage.getCache('test_key');
      expect(cached).toBeUndefined();
    });

    it('过期的缓存应该被自动删除', () => {
      const data = { test: 'value' };
      storage.setCache('test_key', data, 5000);

      const cacheKey = `${StorageKey.CACHE_PREFIX}test_key`;
      expect(storage.has(cacheKey)).toBe(true);

      // 前进 6 秒使缓存过期
      vi.advanceTimersByTime(6000);
      storage.getCache('test_key');

      expect(storage.has(cacheKey)).toBe(false);
    });

    it('不存在的缓存应该返回 undefined', () => {
      const cached = storage.getCache('non_existent');
      expect(cached).toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('应该清除所有缓存项但保留其他存储项', () => {
      // 设置普通存储项
      storage.set(StorageKey.THEME, 'dark');

      // 设置缓存项
      storage.setCache('cache1', 'value1');
      storage.setCache('cache2', 'value2');

      // 清除缓存
      storage.clearCache();

      // 普通存储项应该还在
      expect(storage.has(StorageKey.THEME)).toBe(true);

      // 缓存项应该被清除
      expect(storage.getCache('cache1')).toBeUndefined();
      expect(storage.getCache('cache2')).toBeUndefined();
    });
  });

  describe('clearExpiredCache', () => {
    it('应该只清除过期的缓存项', () => {
      // 设置短期缓存（1秒）
      storage.setCache('short_cache', 'value1', 1000);

      // 设置长期缓存（10秒）
      storage.setCache('long_cache', 'value2', 10000);

      // 前进 2 秒，短期缓存过期
      vi.advanceTimersByTime(2000);

      // 清除过期缓存
      storage.clearExpiredCache();

      // 短期缓存应该被清除
      expect(storage.getCache('short_cache')).toBeUndefined();

      // 长期缓存应该还在
      expect(storage.getCache('long_cache')).toBe('value2');
    });
  });
});

describe('Storage - 使用情况统计', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getUsage', () => {
    it('空存储应该返回 0', () => {
      expect(storage.getUsage()).toBe(0);
    });

    it('应该正确计算存储使用量', () => {
      storage.set(StorageKey.THEME, 'dark');
      const usage = storage.getUsage();
      expect(usage).toBeGreaterThan(0);
    });

    it('添加更多数据后使用量应该增加', () => {
      storage.set(StorageKey.THEME, 'dark');
      const usage1 = storage.getUsage();

      storage.set(StorageKey.LANGUAGE, 'zh-CN');
      const usage2 = storage.getUsage();

      expect(usage2).toBeGreaterThan(usage1);
    });
  });

  describe('getUsageReadable', () => {
    it('应该返回可读的格式', () => {
      storage.set(StorageKey.THEME, 'dark');
      const readable = storage.getUsageReadable();

      expect(readable).toMatch(/\d+(\.\d+)?\s+(B|KB|MB)/);
    });

    it('小于 1KB 应该显示为字节', () => {
      storage.set('small', 'x');
      const readable = storage.getUsageReadable();
      expect(readable).toMatch(/\d+\s+B$/);
    });
  });
});

describe('Storage - 便捷函数', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setItem 应该能正常工作', () => {
    setItem(StorageKey.THEME, 'dark');
    expect(getItem(StorageKey.THEME)).toBe('dark');
  });

  it('getItem 应该能正常工作', () => {
    storage.set(StorageKey.THEME, 'dark');
    expect(getItem(StorageKey.THEME)).toBe('dark');
  });

  it('removeItem 应该能正常工作', () => {
    setItem(StorageKey.THEME, 'dark');
    removeItem(StorageKey.THEME);
    expect(hasItem(StorageKey.THEME)).toBe(false);
  });

  it('clearStorage 应该能正常工作', () => {
    setItem(StorageKey.THEME, 'dark');
    setItem(StorageKey.LANGUAGE, 'zh-CN');
    clearStorage();
    expect(storage.keys().length).toBe(0);
  });

  it('hasItem 应该能正常工作', () => {
    expect(hasItem(StorageKey.THEME)).toBe(false);
    setItem(StorageKey.THEME, 'dark');
    expect(hasItem(StorageKey.THEME)).toBe(true);
  });

  it('setCache 和 getCache 便捷函数应该能正常工作', () => {
    const data = { test: 'value' };
    setCache('test', data);
    expect(getCache('test')).toEqual(data);
  });

  it('clearCache 便捷函数应该能正常工作', () => {
    setCache('test1', 'value1');
    setCache('test2', 'value2');
    clearCache();
    expect(getCache('test1')).toBeUndefined();
    expect(getCache('test2')).toBeUndefined();
  });
});

describe('Storage - 错误处理', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('存储无效 JSON 时应该捕获错误', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 模拟 JSON.stringify 失败
    const circularObj: any = {};
    circularObj.self = circularObj;

    storage.set('test', circularObj);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('读取损坏的 JSON 时应该返回默认值', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 直接设置无效的 JSON
    localStorage.setItem('broken', '{invalid json}');

    const result = storage.get('broken', 'default');
    expect(result).toBe('default');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('Storage - 特殊值处理', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应该能够存储 null', () => {
    storage.set('test_null', null);
    expect(storage.get('test_null')).toBeNull();
  });

  it('应该能够存储 undefined（会被转为 null）', () => {
    storage.set('test_undefined', undefined);
    // JSON.stringify(undefined) 会变成 'undefined'，然后 JSON.parse 会失败
    // 但由于有错误处理，应该返回默认值或 undefined
    const result = storage.get('test_undefined');
    expect([null, undefined]).toContain(result);
  });

  it('应该能够存储空字符串', () => {
    storage.set('test_empty', '');
    expect(storage.get('test_empty')).toBe('');
  });

  it('应该能够存储 0', () => {
    storage.set('test_zero', 0);
    expect(storage.get('test_zero')).toBe(0);
  });

  it('应该能够存储 false', () => {
    storage.set('test_false', false);
    expect(storage.get('test_false')).toBe(false);
  });
});
