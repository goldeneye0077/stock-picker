/**
 * Analysis routes integration tests
 */

import request from 'supertest';

// Create a shared mock instance that will be returned by AnalysisRepository constructor
const mockAnalysisRepoInstance = {
  getFundFlow: jest.fn(),
  getVolumeAnalysis: jest.fn(),
  getVolumeAnalysisByStock: jest.fn(),
  getBuySignals: jest.fn(),
  getMarketOverview: jest.fn(),
  getMainForceBehavior: jest.fn(),
};

// Mock the repositories module BEFORE importing anything else
jest.mock('../../src/repositories', () => {
  return {
    StockRepository: jest.fn().mockImplementation(() => ({})),
    AnalysisRepository: jest.fn().mockImplementation(() => mockAnalysisRepoInstance),
  };
});

import { createTestApp } from '../helpers/testApp';

const app = createTestApp();

describe('Analysis Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analysis/fund-flow', () => {
    it('应该返回资金流向分析数据', async () => {
      const mockFundFlowData = [
        {
          stock: '000001',
          date: '2025-10-22',
          main_fund_flow: 500000000,
          retail_fund_flow: -300000000,
          institutional_flow: 200000000,
          large_order_ratio: 0.65,
        },
      ];

      mockAnalysisRepoInstance.getFundFlow.mockResolvedValue(mockFundFlowData as any);

      const response = await request(app)
        .get('/api/analysis/fund-flow')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.fundFlow).toEqual(mockFundFlowData);
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.summary.totalMainFlow).toBe(500000000);
    });

    it('应该支持 days 参数', async () => {
      mockAnalysisRepoInstance.getFundFlow.mockResolvedValue([]);

      await request(app)
        .get('/api/analysis/fund-flow?days=7')
        .expect(200);

      expect(mockAnalysisRepoInstance.getFundFlow).toHaveBeenCalledWith(
        expect.objectContaining({ days: 7 })
      );
    });

    it('应该支持日期范围查询', async () => {
      mockAnalysisRepoInstance.getFundFlow.mockResolvedValue([]);

      await request(app)
        .get('/api/analysis/fund-flow?date_from=2025-10-01&date_to=2025-10-22')
        .expect(200);

      expect(mockAnalysisRepoInstance.getFundFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          date_from: '2025-10-01',
          date_to: '2025-10-22',
        })
      );
    });

    it('应该支持按股票代码过滤', async () => {
      const mockData = [
        { stock: '000001', main_fund_flow: 100 },
        { stock: '600000', main_fund_flow: 200 },
      ];

      mockAnalysisRepoInstance.getFundFlow.mockResolvedValue(mockData as any);

      const response = await request(app)
        .get('/api/analysis/fund-flow?stock_code=000001')
        .expect(200);

      expect(response.body.data.fundFlow).toHaveLength(1);
      expect(response.body.data.fundFlow[0].stock).toBe('000001');
    });

    it('空数据时应该返回空摘要', async () => {
      mockAnalysisRepoInstance.getFundFlow.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/analysis/fund-flow')
        .expect(200);

      expect(response.body.data.fundFlow).toEqual([]);
      expect(response.body.data.summary.totalMainFlow).toBe(0);
      expect(response.body.data.summary.avgLargeOrderRatio).toBe(0);
    });
  });

  describe('GET /api/analysis/volume', () => {
    it('应该返回成交量分析数据', async () => {
      const mockVolumeData = [
        {
          stock: '000001',
          name: '平安银行',
          date: '2025-10-22',
          volumeRatio: 2.5,
          changePercent: 5.5,
          price: 12.5,
        },
      ];

      mockAnalysisRepoInstance.getVolumeAnalysis.mockResolvedValue(mockVolumeData as any);

      const response = await request(app)
        .get('/api/analysis/volume')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.volumeSurges).toEqual(mockVolumeData);
    });

    it('应该支持 days 参数', async () => {
      mockAnalysisRepoInstance.getVolumeAnalysis.mockResolvedValue([]);

      await request(app)
        .get('/api/analysis/volume?days=10')
        .expect(200);

      expect(mockAnalysisRepoInstance.getVolumeAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({ days: 10 })
      );
    });

    it('应该支持按板块过滤', async () => {
      const mockData = [
        { stock: '000001', name: '平安银行' },
        { stock: '300001', name: '某创业板' },
        { stock: '600000', name: '浦发银行' },
      ];

      mockAnalysisRepoInstance.getVolumeAnalysis.mockResolvedValue(mockData as any);

      const response = await request(app)
        .get('/api/analysis/volume?board=gem')
        .expect(200);

      // 创业板过滤 (300开头)
      const filtered = response.body.data.volumeSurges;
      expect(filtered.every((item: any) => item.stock?.startsWith('300'))).toBe(true);
    });

    it('应该支持按股票名称搜索', async () => {
      const mockData = [
        { stock: '000001', name: '平安银行' },
        { stock: '600000', name: '浦发银行' },
      ];

      mockAnalysisRepoInstance.getVolumeAnalysis.mockResolvedValue(mockData as any);

      const response = await request(app)
        .get('/api/analysis/volume?stock_search=平安')
        .expect(200);

      expect(response.body.data.volumeSurges).toHaveLength(1);
      expect(response.body.data.volumeSurges[0].name).toContain('平安');
    });

    it('指定股票代码时应该获取详细分析', async () => {
      const mockVolumeData: any[] = [];
      const mockDetailData = [
        { date: '2025-10-22', volume_ratio: 2.5 },
        { date: '2025-10-21', volume_ratio: 1.8 },
      ];

      mockAnalysisRepoInstance.getVolumeAnalysis.mockResolvedValue(mockVolumeData);
      mockAnalysisRepoInstance.getVolumeAnalysisByStock.mockResolvedValue(mockDetailData as any);

      const response = await request(app)
        .get('/api/analysis/volume?stock_code=000001')
        .expect(200);

      expect(mockAnalysisRepoInstance.getVolumeAnalysisByStock).toHaveBeenCalledWith('000001', 30);
      expect(response.body.data.volumeAnalysis).toEqual(mockDetailData);
    });

    it('应该限制返回数量为 50 条', async () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        stock: `00000${i}`,
        name: `股票${i}`,
      }));

      mockAnalysisRepoInstance.getVolumeAnalysis.mockResolvedValue(mockData as any);

      const response = await request(app)
        .get('/api/analysis/volume')
        .expect(200);

      expect(response.body.data.volumeSurges.length).toBeLessThanOrEqual(50);
    });
  });

  describe('GET /api/analysis/signals', () => {
    it('应该返回买入信号列表', async () => {
      const mockSignals = [
        {
          stock_code: '000001',
          signal_type: 'volume_surge',
          confidence: 0.85,
          price: 12.5,
          created_at: '2025-10-22',
        },
      ];

      mockAnalysisRepoInstance.getBuySignals.mockResolvedValue(mockSignals as any);

      const response = await request(app)
        .get('/api/analysis/signals')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.signals).toEqual(mockSignals);
      expect(response.body.data.summary).toBeDefined();
    });

    it('应该支持 days 参数', async () => {
      mockAnalysisRepoInstance.getBuySignals.mockResolvedValue([]);

      await request(app)
        .get('/api/analysis/signals?days=30')
        .expect(200);

      expect(mockAnalysisRepoInstance.getBuySignals).toHaveBeenCalledWith(30);
    });

    it('days 参数无效时应该返回 400', async () => {
      const response = await request(app)
        .get('/api/analysis/signals?days=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid days parameter');
    });

    it('days 参数超出范围时应该返回 400', async () => {
      const response = await request(app)
        .get('/api/analysis/signals?days=400')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('应该支持按信号类型过滤', async () => {
      const mockSignals = [
        { stock_code: '000001', signal_type: 'volume_surge', confidence: 0.85 },
        { stock_code: '600000', signal_type: 'main_force', confidence: 0.75 },
      ];

      mockAnalysisRepoInstance.getBuySignals.mockResolvedValue(mockSignals as any);

      const response = await request(app)
        .get('/api/analysis/signals?signal_type=volume_surge')
        .expect(200);

      expect(response.body.data.signals).toHaveLength(1);
      expect(response.body.data.signals[0].signal_type).toBe('volume_surge');
    });

    it('应该生成信号摘要统计', async () => {
      const mockSignals = [
        { signal_type: 'volume_surge', confidence: 0.85 },
        { signal_type: 'volume_surge', confidence: 0.75 },
        { signal_type: 'main_force', confidence: 0.90 },
      ];

      mockAnalysisRepoInstance.getBuySignals.mockResolvedValue(mockSignals as any);

      const response = await request(app)
        .get('/api/analysis/signals')
        .expect(200);

      const summary = response.body.data.summary;
      expect(summary.volume_surge).toBeDefined();
      expect(summary.volume_surge.count).toBe(2);
      expect(summary.volume_surge.avgConfidence).toBe(0.8);
      expect(summary.main_force.count).toBe(1);
    });
  });

  describe('GET /api/analysis/market-overview', () => {
    it('应该返回市场概览数据', async () => {
      const mockOverview = {
        totalStocks: 5000,
        advancers: 3000,
        decliners: 1500,
        unchanged: 500,
        volumeSurgeCount: 200,
      };

      mockAnalysisRepoInstance.getMarketOverview.mockResolvedValue(mockOverview as any);

      const response = await request(app)
        .get('/api/analysis/market-overview')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockOverview);
    });

    it('数据库错误时应该返回 500', async () => {
      mockAnalysisRepoInstance.getMarketOverview.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/analysis/market-overview')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/analysis/main-force', () => {
    it('应该返回主力行为分析数据', async () => {
      const mockMainForceData = [
        {
          stock: '000001',
          name: '平安银行',
          trend: 'strong',
          strength: 8.5,
          latestVolume: 120000000,
        },
      ];

      mockAnalysisRepoInstance.getMainForceBehavior.mockResolvedValue(mockMainForceData as any);

      const response = await request(app)
        .get('/api/analysis/main-force')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.mainForce).toEqual(mockMainForceData);
      expect(response.body.data.summary).toBeDefined();
    });

    it('应该支持 days 和 limit 参数', async () => {
      mockAnalysisRepoInstance.getMainForceBehavior.mockResolvedValue([]);

      await request(app)
        .get('/api/analysis/main-force?days=14&limit=50')
        .expect(200);

      expect(mockAnalysisRepoInstance.getMainForceBehavior).toHaveBeenCalledWith(14, 50);
    });

    it('days 参数无效时应该返回 400', async () => {
      const response = await request(app)
        .get('/api/analysis/main-force?days=0')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid days parameter');
    });

    it('limit 参数无效时应该返回 400', async () => {
      const response = await request(app)
        .get('/api/analysis/main-force?limit=300')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid limit parameter');
    });

    it('应该生成主力行为摘要统计', async () => {
      const mockData = [
        { trend: 'strong', strength: 9 },
        { trend: 'strong', strength: 8 },
        { trend: 'moderate', strength: 5 },
        { trend: 'weak', strength: 2 },
      ];

      mockAnalysisRepoInstance.getMainForceBehavior.mockResolvedValue(mockData as any);

      const response = await request(app)
        .get('/api/analysis/main-force')
        .expect(200);

      const summary = response.body.data.summary;
      expect(summary.strongCount).toBe(2);
      expect(summary.moderateCount).toBe(1);
      expect(summary.weakCount).toBe(1);
      expect(summary.avgStrength).toBe(6); // Math.round((9+8+5+2)/4)
    });
  });

  describe('Error Handling', () => {
    it('不存在的路由应该返回 404', async () => {
      const response = await request(app)
        .get('/api/analysis/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('Repository 抛出错误时应该正确处理', async () => {
      mockAnalysisRepoInstance.getFundFlow.mockRejectedValue(new Error('Unexpected error'));

      const response = await request(app)
        .get('/api/analysis/fund-flow')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});
