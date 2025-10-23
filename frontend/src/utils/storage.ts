/**
 * 本地存储工具函数
 * 提供类型安全的 localStorage 封装
 */

/**
 * 存储键名枚举
 */
export enum StorageKey {
  // 用户偏好设置
  THEME = 'stock_picker_theme',
  LANGUAGE = 'stock_picker_language',
  LAYOUT = 'stock_picker_layout',

  // 筛选条件
  STOCK_LIST_FILTERS = 'stock_picker_stock_list_filters',
  ANALYSIS_FILTERS = 'stock_picker_analysis_filters',

  // 用户数据
  FAVORITE_STOCKS = 'stock_picker_favorite_stocks',
  RECENT_VIEWED = 'stock_picker_recent_viewed',

  // 表格设置
  TABLE_PAGE_SIZE = 'stock_picker_table_page_size',
  TABLE_COLUMNS = 'stock_picker_table_columns',

  // API 配置
  API_BASE_URL = 'stock_picker_api_base_url',

  // 缓存数据（带时间戳）
  CACHE_PREFIX = 'stock_picker_cache_'
}

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiry: number; // 过期时间（毫秒）
}

/**
 * 存储工具类
 */
class Storage {
  /**
   * 设置存储项
   * @param key 键名
   * @param value 值
   */
  set<T>(key: StorageKey | string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (error) {
      console.error('Storage set error:', error);
    }
  }

  /**
   * 获取存储项
   * @param key 键名
   * @param defaultValue 默认值
   * @returns 存储的值或默认值
   */
  get<T>(key: StorageKey | string, defaultValue?: T): T | undefined {
    try {
      const item = localStorage.getItem(key);

      if (item === null) {
        return defaultValue;
      }

      return JSON.parse(item) as T;
    } catch (error) {
      console.error('Storage get error:', error);
      return defaultValue;
    }
  }

  /**
   * 移除存储项
   * @param key 键名
   */
  remove(key: StorageKey | string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Storage remove error:', error);
    }
  }

  /**
   * 清空所有存储
   */
  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Storage clear error:', error);
    }
  }

  /**
   * 检查键是否存在
   * @param key 键名
   * @returns 是否存在
   */
  has(key: StorageKey | string): boolean {
    return localStorage.getItem(key) !== null;
  }

  /**
   * 获取所有项目键名
   * @returns 键名数组
   */
  keys(): string[] {
    return Object.keys(localStorage);
  }

  /**
   * 设置带过期时间的缓存
   * @param key 键名
   * @param value 值
   * @param expiry 过期时间（毫秒）
   */
  setCache<T>(key: string, value: T, expiry: number = 3600000): void {
    const cacheKey = `${StorageKey.CACHE_PREFIX}${key}`;
    const cacheItem: CacheItem<T> = {
      data: value,
      timestamp: Date.now(),
      expiry
    };
    this.set(cacheKey, cacheItem);
  }

  /**
   * 获取缓存项（检查过期时间）
   * @param key 键名
   * @returns 缓存的值或 undefined
   */
  getCache<T>(key: string): T | undefined {
    const cacheKey = `${StorageKey.CACHE_PREFIX}${key}`;
    const cacheItem = this.get<CacheItem<T>>(cacheKey);

    if (!cacheItem) {
      return undefined;
    }

    const now = Date.now();
    const age = now - cacheItem.timestamp;

    // 检查是否过期
    if (age > cacheItem.expiry) {
      this.remove(cacheKey);
      return undefined;
    }

    return cacheItem.data;
  }

  /**
   * 清除所有缓存项
   */
  clearCache(): void {
    const keys = this.keys();
    keys.forEach(key => {
      if (key.startsWith(StorageKey.CACHE_PREFIX)) {
        this.remove(key);
      }
    });
  }

  /**
   * 清除过期的缓存项
   */
  clearExpiredCache(): void {
    const keys = this.keys();
    const now = Date.now();

    keys.forEach(key => {
      if (key.startsWith(StorageKey.CACHE_PREFIX)) {
        const cacheItem = this.get<CacheItem<any>>(key);
        if (cacheItem) {
          const age = now - cacheItem.timestamp;
          if (age > cacheItem.expiry) {
            this.remove(key);
          }
        }
      }
    });
  }

  /**
   * 获取存储使用情况（估算）
   * @returns 使用的字节数
   */
  getUsage(): number {
    let total = 0;
    const keys = this.keys();

    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        total += key.length + value.length;
      }
    });

    return total;
  }

  /**
   * 获取存储使用情况（可读格式）
   * @returns 格式化的使用情况字符串
   */
  getUsageReadable(): string {
    const bytes = this.getUsage();

    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
  }
}

// 导出单例实例
export const storage = new Storage();

// 便捷函数导出
export const setItem = storage.set.bind(storage);
export const getItem = storage.get.bind(storage);
export const removeItem = storage.remove.bind(storage);
export const clearStorage = storage.clear.bind(storage);
export const hasItem = storage.has.bind(storage);
export const setCache = storage.setCache.bind(storage);
export const getCache = storage.getCache.bind(storage);
export const clearCache = storage.clearCache.bind(storage);
export const clearExpiredCache = storage.clearExpiredCache.bind(storage);
