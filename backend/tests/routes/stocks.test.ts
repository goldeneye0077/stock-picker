/**
 * Stock routes integration tests
 */

import request from 'supertest';

// Create a shared mock instance that will be returned by StockRepository constructor
const mockStockRepoInstanceInstance = {
  findAll: jest.fn(),
  findDetailsByCode: jest.fn(),
  search: jest.fn(),
  findAllBasic: jest.fn(),
  findByDate: jest.fn(),
};

// Mock the repositories module BEFORE importing anything else
jest.mock('../../src/repositories', () => {
  return {
    StockRepository: jest.fn().mockImplementation(() => mockStockRepoInstanceInstance),
    AnalysisRepository: jest.fn().mockImplementation(() => ({})),
  };
});

import { createTestApp } from '../helpers/testApp';

const app = createTestApp();

describe('Stock Routes', () => {
  beforeEach(() => {
    // Clear all mock function calls before each test
    jest.clearAllMocks();
  });

  describe('GET /api/stocks', () => {
    it('应该返回所有股票列表', async () => {
      const mockStocks = [
        {
          code: '000001',
          name: '平安银行',
          exchange: 'SZ',
          industry: '银行',
          current_price: 12.5,
          change_percent: 4.17,
          volume: 120000000,
        },
        {
          code: '600000',
          name: '浦发银行',
          exchange: 'SH',
          industry: '银行',
          current_price: 8.3,
          change_percent: -2.35,
          volume: 80000000,
        },
      ];

      mockStockRepoInstanceInstance.findAll.mockResolvedValue(mockStocks as any);

      const response = await request(app)
        .get('/api/stocks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStocks);
      expect(response.body.total).toBe(2);
      expect(mockStockRepoInstanceInstance.findAll).toHaveBeenCalledTimes(1);
    });

    it('空数据时应该返回空数组', async () => {
      mockStockRepoInstance.findAll.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/stocks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('数据库错误时应该返回 500', async () => {
      mockStockRepoInstance.findAll.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/stocks')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/stocks/:code', () => {
    it('应该返回指定股票的详细信息', async () => {
      const mockStockDetails = {
        code: '000001',
        name: '平安银行',
        exchange: 'SZ',
        industry: '银行',
        current_price: 12.5,
        change_percent: 4.17,
        volume: 120000000,
        klines: [
          {
            date: '2025-10-22',
            open: 12.0,
            high: 12.6,
            low: 11.9,
            close: 12.5,
            volume: 120000000,
          },
        ],
      };

      mockStockRepoInstance.findDetailsByCode.mockResolvedValue(mockStockDetails as any);

      const response = await request(app)
        .get('/api/stocks/000001')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStockDetails);
      expect(mockStockRepoInstance.findDetailsByCode).toHaveBeenCalledWith('000001');
    });

    it('股票不存在时应该返回 404', async () => {
      mockStockRepoInstance.findDetailsByCode.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/stocks/999999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Stock not found');
    });
  });

  describe('GET /api/stocks/search/:query', () => {
    it('应该根据股票代码搜索', async () => {
      const mockSearchResults = [
        {
          code: '000001',
          name: '平安银行',
          exchange: 'SZ',
          industry: '银行',
        },
      ];

      mockStockRepoInstance.search.mockResolvedValue(mockSearchResults as any);

      const response = await request(app)
        .get('/api/stocks/search/000001')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSearchResults);
      expect(mockStockRepoInstance.search).toHaveBeenCalledWith('000001', 20);
    });

    it('应该根据股票名称搜索', async () => {
      const mockSearchResults = [
        {
          code: '000001',
          name: '平安银行',
          exchange: 'SZ',
          industry: '银行',
        },
      ];

      mockStockRepoInstance.search.mockResolvedValue(mockSearchResults as any);

      const response = await request(app)
        .get('/api/stocks/search/平安')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSearchResults);
    });

    it('应该支持拼音搜索', async () => {
      const mockSearchResults: any[] = [];
      const mockAllStocks = [
        { code: '000001', name: '平安银行', exchange: 'SZ', industry: '银行' },
        { code: '600000', name: '浦发银行', exchange: 'SH', industry: '银行' },
      ];

      mockStockRepoInstance.search.mockResolvedValue(mockSearchResults);
      mockStockRepoInstance.findAllBasic.mockResolvedValue(mockAllStocks as any);

      const response = await request(app)
        .get('/api/stocks/search/payh')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      // 拼音匹配应该被调用
      expect(mockStockRepoInstance.findAllBasic).toHaveBeenCalledWith(500);
    });

    it('搜索无结果时应该返回空数组', async () => {
      mockStockRepoInstance.search.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/stocks/search/nonexistent')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/stocks/history/date/:date', () => {
    it('应该返回指定日期的股票行情', async () => {
      const mockHistoryData = [
        {
          code: '000001',
          name: '平安银行',
          date: '2025-10-22',
          open: 12.0,
          high: 12.6,
          low: 11.9,
          close: 12.5,
          volume: 120000000,
        },
      ];

      mockStockRepoInstance.findByDate.mockResolvedValue(mockHistoryData as any);

      const response = await request(app)
        .get('/api/stocks/history/date/2025-10-22')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockHistoryData);
      expect(response.body.total).toBe(1);
      expect(response.body.date).toBe('2025-10-22');
      expect(mockStockRepoInstance.findByDate).toHaveBeenCalledWith('2025-10-22');
    });

    it('日期格式无效时应该返回 400', async () => {
      const response = await request(app)
        .get('/api/stocks/history/date/20251022')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid date format');
    });

    it('日期格式无效（错误分隔符）时应该返回 400', async () => {
      const response = await request(app)
        .get('/api/stocks/history/date/2025/10/22')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('指定日期无数据时应该返回空数组', async () => {
      mockStockRepoInstance.findByDate.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/stocks/history/date/2020-01-01')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('不存在的路由应该返回 404', async () => {
      const response = await request(app)
        .get('/api/stocks/nonexistent/route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('Repository 抛出错误时应该正确处理', async () => {
      mockStockRepoInstance.findAll.mockRejectedValue(new Error('Unexpected database error'));

      const response = await request(app)
        .get('/api/stocks')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
