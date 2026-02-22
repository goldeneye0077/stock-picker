# 冲板优选算法优化计划

## 背景
当前冲板优选算法基于以下条件标记股票为"冲板优选"：
- 竞价涨幅 ≥ 7.0%
- 量比 ≥ 1.5
- 距涨停空间 ≥ 2.0%
- 非竞价涨停股

回测结果显示（过去10个交易日）：
- 总预测次数：63次
- 实际涨停：11次
- 成功率：17.5%

主要失败原因：
- 高开低走（竞价高开7-12%，收盘回落）
- 科创板/创业板20%涨停板更难封板（36只，占69%）
- 量比虚高（部分>10x，但多为开盘脉冲）

## 用户需求
1. **提高成功率**：当前17.5%太低
2. **降低风险**：避免高开低走，提高盈亏比
3. **参数自动调整**：根据市场环境优化阈值

可接受改进方式：
- 增加新特征指标
- 集成机器学习模型
- 多策略融合

## 现有资源分析

### 1. 现有算法框架
- **核心文件**：`data-service/src/routes/analysis.py` (第883-1389行)
- **基础评分**：量比35%、涨幅25%、资金强度20%、成交量密度15%、换手率5%
- **题材增强**：`final_score = base_heat_score × (1 + α × theme_heat_score)`
- **涨停预测**：`likely_limit_up` 布尔标记

### 2. 相关策略模块
- **智能选股**：`smart_selection.py`（技术35%、基本面30%、资金25%、市场10%）
- **高级选股**：`advanced_selection.py`（动量35%、趋势质量25%、板块热度20%、基本面20%）
- **买入信号**：`predictor.py`（成交量40%、价格30%、资金30%）

### 3. 回测框架
- **回测引擎**：`backtest_engine.py`
- **初始资金**：10万元
- **交易成本**：0.1%
- **持有期**：最多5天
- **绩效指标**：总收益、年化、最大回撤、夏普、胜率、盈亏比

## 优化方案设计：增强版冲板优选算法

### 核心思想：三阶段过滤 + 机器学习评分

```
第一阶段：基础筛选（快速过滤）
  ↓
第二阶段：特征工程（15个维度）
  ↓
第三阶段：ML模型预测（LightGBM + XGBoost集成）
  ↓
第四阶段：多策略验证（3个辅助策略确认）
  ↓
最终结果：涨停概率评分 + 风险等级
```

### 第一阶段：基础筛选（优化现有条件）

**目标**：提高信号质量，减少虚高量比和高开低走

**优化条件**：
1. **涨幅条件优化**：
   - 主板/中小板：5% ≤ 竞价涨幅 ≤ 9.5%（避免追高）
   - 创业板/科创板：7% ≤ 竞价涨幅 ≤ 19%（20%涨停板）
   - 排除涨幅 > 9.5%的主板股（容易炸板）

2. **量比条件优化**：
   - 1.5 ≤ 量比 ≤ 8.0（排除虚高量比）
   - 结合竞价金额 > 3000万（确保资金真实参与）

3. **流通市值过滤**：
   - 10亿 ≤ 流通市值 ≤ 500亿（排除太小和太大）
   - 科创板/创业板：20亿 ≤ 流通市值 ≤ 300亿

4. **价格位置过滤**：
   - 股价 ≥ 3元（排除低价股操纵）
   - 非ST、非退市整理期

### 第二阶段：特征工程（15个增强维度）

**新增特征表**：

| 类别 | 特征 | 计算方式 | 意义 |
|------|------|----------|------|
| **资金特征** | 大单占比 | 大单金额 / 总成交额 | 主力参与度 |
| | 资金集中度 | 前5档买盘金额 / 总买盘 | 买盘强度 |
| | 资金流入率 | 主力净流入 / 流通市值 | 资金效率 |
| **技术特征** | RSI(14) | 14日相对强弱指数 | 超买超卖 |
| | 价格动量 | 前3日累计涨幅 | 短期趋势 |
| | 波动率 | 前5日价格标准差 | 风险度量 |
| | 布林带位置 | (现价-下轨)/(上轨-下轨) | 价格位置 |
| **板块特征** | 板块强度 | 同板块股票平均涨幅 | 板块效应 |
| | 板块排名 | 板块涨幅市场排名 | 热点判断 |
| | 龙头跟随度 | 与板块龙头涨幅差 | 跟风强度 |
| **市场特征** | 市场情绪 | 上涨股票占比 | 整体氛围 |
| | 成交量能 | 全市场成交量变化 | 资金活跃度 |
| | 涨停效应 | 昨日涨停股今日表现 | 连板效应 |
| **时序特征** | 竞价趋势 | 9:20-9:25价格变化 | 竞价动能 |
| | 开盘强度 | 开盘5分钟成交量占比 | 开盘承接 |

### 第三阶段：机器学习模型预测

**模型架构**：LightGBM + XGBoost 集成投票

**数据准备**：
- **时间窗口**：过去6个月数据
- **正样本**：实际涨停的"冲板优选"股票（约11个）
- **负样本**：未涨停的"冲板优选"股票（约52个）
- **特征数量**：15个核心特征 + 5个交互特征
- **数据增强**：SMOTE过采样处理样本不均衡

**训练策略**：
1. **时间序列交叉验证**：避免未来数据泄露
2. **特征重要性筛选**：保留Top-10最重要特征
3. **集成投票**：LightGBM(权重0.6) + XGBoost(权重0.4)
4. **概率输出**：输出涨停概率(0-100%)而非二分类

**模型部署**：
- 每日收盘后自动重新训练（增量学习）
- 模型版本管理：保留最近3个版本
- 预测缓存：9:25前预计算特征，9:25后快速预测

### 第四阶段：多策略验证系统

**三重验证机制**：

1. **冲板优选ML模型**（主策略，权重50%）
   - 输出：涨停概率 ≥ 60%
   - 要求：概率置信度 > 70%

2. **智能选股策略**（辅助策略，权重30%）
   - 条件：综合评分 ≥ 75分
   - 技术面评分 ≥ 80分

3. **主力行为分析**（风控策略，权重20%）
   - 条件：主力资金连续3日净流入
   - 大单占比 ≥ 30%

**融合规则**：
- **强烈推荐**：主策略通过 + 至少1个辅助策略通过
- **谨慎推荐**：仅主策略通过
- **不建议**：主策略未通过

### 第五阶段：动态参数调整系统

**自适应阈值调整**：

1. **市场波动率自适应**：
   ```
   波动率 > 2.0%：收紧条件（涨幅下限+1%，量比下限+0.5）
   波动率 < 0.5%：放宽条件（涨幅下限-1%，量比下限-0.3）
   ```

2. **成功率反馈调整**：
   - 近5日成功率 < 15%：自动放宽条件
   - 近5日成功率 > 30%：自动收紧条件
   - 每日统计，动态调整

3. **板块轮动感知**：
   - 识别当日强势板块，降低该板块股票阈值
   - 识别弱势板块，提高该板块股票阈值

## 实施路线图

### Phase 1：特征工程扩展（1-2周）

### 1.1 数据库表结构扩展

在 `data-service/src/utils/database.py` 中新增 `auction_enhanced_features` 表：

```sql
CREATE TABLE IF NOT EXISTS auction_enhanced_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    -- 资金特征（3个）
    large_order_ratio REAL,          -- 大单占比（大单金额/总成交额）
    fund_concentration REAL,         -- 资金集中度（前5档买盘金额/总买盘）
    fund_inflow_rate REAL,           -- 资金流入率（主力净流入/流通市值）
    -- 技术特征（4个）
    rsi_14 REAL,                     -- RSI(14)相对强弱指数
    price_momentum_3d REAL,          -- 前3日累计涨幅
    price_volatility_5d REAL,        -- 前5日价格标准差（波动率）
    bollinger_position REAL,         -- 布林带位置（(现价-下轨)/(上轨-下轨)）
    -- 板块特征（3个）
    sector_strength REAL,            -- 板块强度（同板块股票平均涨幅）
    sector_rank INTEGER,             -- 板块排名（板块涨幅市场排名）
    leader_following REAL,           -- 龙头跟随度（与板块龙头涨幅差）
    -- 市场特征（3个）
    market_sentiment REAL,           -- 市场情绪（上涨股票占比）
    market_volume_power REAL,        -- 成交量能（全市场成交量变化）
    limit_up_effect REAL,            -- 涨停效应（昨日涨停股今日表现）
    -- 时序特征（2个）
    auction_trend REAL,              -- 竞价趋势（9:20-9:25价格变化斜率）
    opening_strength REAL,           -- 开盘强度（开盘5分钟成交量占比）
    -- 综合评分
    enhanced_score REAL,             -- 增强评分（15个特征加权得分）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_code) REFERENCES stocks (code),
    UNIQUE(stock_code, trade_date)
);
```

**索引优化**：
- `idx_auction_enhanced_stock_date` ON auction_enhanced_features(stock_code, trade_date)
- `idx_auction_enhanced_date` ON auction_enhanced_features(trade_date)
- `idx_auction_enhanced_score` ON auction_enhanced_features(enhanced_score)

### 1.1.1 数据库扩展策略（与现有表的关系）

**扩展现有表 vs 新建表策略**：

| 特征类别 | 特征名称 | 存储位置 | 数据来源 | 计算频率 |
|----------|----------|----------|----------|----------|
| **资金特征** | 大单占比 | `auction_enhanced_features`表 | `fund_flow`表 + 实时买盘五档 | 每日更新 |
| | 资金集中度 | `auction_enhanced_features`表 | `realtime_quotes`表（买盘五档） | 实时计算 |
| | 资金流入率 | `auction_enhanced_features`表 | `fund_flow`表 + `daily_basic`表 | 每日更新 |
| **技术特征** | RSI(14) | `technical_indicators`表（扩展现有） | 现有`rsi6`、`rsi12`、`rsi24`字段 | 每日更新 |
| | 价格动量(3日) | `trend_analysis`表（扩展现有） | `trend_5d_slope`等字段转换 | 每日更新 |
| | 价格波动率(5日) | `technical_indicators`表（新增字段） | `klines`表价格标准差 | 每日更新 |
| | 布林带位置 | `technical_indicators`表（扩展现有） | 现有`boll_upper`、`boll_lower`字段 | 每日更新 |
| **板块特征** | 板块强度 | `sector_moneyflow`表（扩展现有） | 同板块股票平均涨幅 | 每日更新 |
| | 板块排名 | `sector_moneyflow`表（新增字段） | 全市场板块涨幅排序 | 每日更新 |
| | 龙头跟随度 | `auction_enhanced_features`表 | 板块龙头股涨幅对比 | 每日更新 |
| **市场特征** | 市场情绪 | `market_moneyflow`表（扩展现有） | 上涨股票占比统计 | 每日更新 |
| | 成交量能 | `market_moneyflow`表（扩展现有） | 全市场成交量变化 | 每日更新 |
| | 涨停效应 | `auction_enhanced_features`表 | 昨日涨停股今日表现统计 | 每日更新 |
| **时序特征** | 竞价趋势 | `quote_history`表（扩展现有） | 9:20-9:25价格序列 | 实时计算 |
| | 开盘强度 | `quote_history`表（扩展现有） | 9:30-9:35成交量占比 | 实时计算 |

**实施原则**：
1. **优先扩展现有表**：已有表结构（如`technical_indicators`、`trend_analysis`）直接添加字段
2. **新建汇总表**：`auction_enhanced_features`作为特征汇总表，便于快速查询
3. **保持一致性**：确保特征计算逻辑与数据来源一致
4. **性能优化**：高频查询特征存储在汇总表，低频特征依赖原有表

**现有表字段扩展**（在`database.py`中添加）：
```sql
-- 在technical_indicators表中添加新字段
ALTER TABLE technical_indicators ADD COLUMN price_volatility_5d REAL;
ALTER TABLE technical_indicators ADD COLUMN bollinger_position REAL;

-- 在trend_analysis表中添加新字段
ALTER TABLE trend_analysis ADD COLUMN price_momentum_3d REAL;

-- 在sector_moneyflow表中添加新字段
ALTER TABLE sector_moneyflow ADD COLUMN sector_rank INTEGER;

-- 在market_moneyflow表中添加新字段
ALTER TABLE market_moneyflow ADD COLUMN market_sentiment REAL;
ALTER TABLE market_moneyflow ADD COLUMN market_volume_power REAL;

-- 在quote_history表中添加新字段（用于时序特征）
ALTER TABLE quote_history ADD COLUMN auction_trend REAL;
ALTER TABLE quote_history ADD COLUMN opening_strength REAL;
```

### 1.2 特征计算模块设计

新建 `data-service/src/analyzers/enhanced_features/feature_calculator.py`：

```python
class EnhancedFeatureCalculator:
    """15个增强特征计算器"""

    def __init__(self, db_path):
        self.db_path = db_path

    async def calculate_all_features(self, stock_code: str, trade_date: str):
        """计算15个增强特征"""
        features = {}

        # 1. 资金特征计算
        features.update(await self._calculate_fund_features(stock_code, trade_date))

        # 2. 技术特征计算（利用现有IndicatorCalculator）
        features.update(await self._calculate_technical_features(stock_code, trade_date))

        # 3. 板块特征计算
        features.update(await self._calculate_sector_features(stock_code, trade_date))

        # 4. 市场特征计算
        features.update(await self._calculate_market_features(trade_date))

        # 5. 时序特征计算
        features.update(await self._calculate_temporal_features(stock_code, trade_date))

        # 6. 综合评分计算
        features['enhanced_score'] = self._calculate_enhanced_score(features)

        return features

    async def _calculate_fund_features(self, stock_code: str, trade_date: str):
        """计算资金特征"""
        # 从fund_flow表获取大单数据
        # 从realtime_quotes获取买盘五档数据
        # 从daily_basic获取流通市值
        pass

    async def _calculate_technical_features(self, stock_code: str, trade_date: str):
        """计算技术特征（利用现有technical_indicators表）"""
        # 调用现有的IndicatorCalculator
        # 或从technical_indicators表查询RSI等数据
        pass

    async def _calculate_sector_features(self, stock_code: str, trade_date: str):
        """计算板块特征"""
        # 1. 查询股票所属行业
        # 2. 获取同行业所有股票当日表现
        # 3. 计算板块强度和排名
        pass

    async def _calculate_market_features(self, trade_date: str):
        """计算市场特征"""
        # 获取全市场股票数据
        # 计算上涨股票占比、成交量变化
        # 统计昨日涨停股今日表现
        pass

    async def _calculate_temporal_features(self, stock_code: str, trade_date: str):
        """计算时序特征"""
        # 从quote_history获取9:20-9:25竞价数据
        # 计算竞价趋势（价格变化斜率）
        # 计算开盘强度（9:30-9:35成交量占比）
        pass

    def _calculate_enhanced_score(self, features: dict) -> float:
        """计算增强综合评分"""
        weights = {
            'large_order_ratio': 0.15,      # 大单占比
            'fund_concentration': 0.10,     # 资金集中度
            'fund_inflow_rate': 0.10,       # 资金流入率
            'rsi_14': 0.08,                 # RSI(14)
            'price_momentum_3d': 0.08,      # 价格动量
            'price_volatility_5d': -0.05,   # 波动率（负权重，越高越差）
            'bollinger_position': 0.07,     # 布林带位置
            'sector_strength': 0.08,        # 板块强度
            'sector_rank': 0.06,            # 板块排名
            'leader_following': 0.04,       # 龙头跟随度
            'market_sentiment': 0.05,       # 市场情绪
            'market_volume_power': 0.04,    # 成交量能
            'limit_up_effect': 0.04,        # 涨停效应
            'auction_trend': 0.07,          # 竞价趋势
            'opening_strength': 0.05,       # 开盘强度
        }

        score = 0.0
        for feature, weight in weights.items():
            value = features.get(feature, 0.0)
            if isinstance(value, (int, float)):
                score += value * weight

        # 归一化到0-100分
        return max(0.0, min(100.0, score * 100))
```

### 1.3 批量特征计算脚本

新建 `data-service/scripts/compute_enhanced_features.py`：

```python
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent))

from src.analyzers.enhanced_features.feature_calculator import EnhancedFeatureCalculator
from src.utils.database import get_database

async def compute_features_for_date(trade_date: str):
    """为指定日期所有股票计算增强特征"""
    calculator = EnhancedFeatureCalculator()

    async with get_database() as db:
        # 1. 获取当日有集合竞价数据的股票列表
        cursor = await db.execute("""
            SELECT DISTINCT stock_code
            FROM quote_history
            WHERE DATE(snapshot_time) = ?
        """, (trade_date,))
        stock_codes = [row[0] for row in await cursor.fetchall()]

        # 2. 分批计算特征（避免内存溢出）
        batch_size = 50
        for i in range(0, len(stock_codes), batch_size):
            batch = stock_codes[i:i+batch_size]
            tasks = []

            for stock_code in batch:
                task = calculator.calculate_and_store_features(stock_code, trade_date)
                tasks.append(task)

            # 并行计算
            await asyncio.gather(*tasks)

            print(f"完成批次 {i//batch_size + 1}/{(len(stock_codes)-1)//batch_size + 1}")

async def main():
    """主函数：计算最近10个交易日的特征"""
    # 获取最近10个交易日
    async with get_database() as db:
        cursor = await db.execute("""
            SELECT DISTINCT DATE(snapshot_time) as date
            FROM quote_history
            ORDER BY date DESC
            LIMIT 10
        """)
        dates = [row[0] for row in await cursor.fetchall()]

    for trade_date in dates:
        print(f"开始计算 {trade_date} 的特征...")
        await compute_features_for_date(trade_date)
        print(f"完成 {trade_date} 的特征计算")

if __name__ == "__main__":
    asyncio.run(main())
```

### 1.4 集成到现有API

修改 `data-service/src/routes/analysis.py`，新增API端点：

```python
@router.get("/auction/enhanced-features")
async def get_auction_enhanced_features(
    trade_date: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200)
):
    """获取增强特征评分结果"""
    # 1. 获取基础集合竞价数据
    # 2. 查询增强特征表
    # 3. 综合计算最终评分
    # 4. 返回包含增强特征的结果
    pass

def calculate_enhanced_limit_up_probability(item: dict) -> float:
    """计算增强版涨停概率"""
    # 结合15个增强特征计算涨停概率
    base_features = [
        'large_order_ratio',
        'fund_concentration',
        'rsi_14',
        'price_momentum_3d',
        'sector_strength',
        'market_sentiment',
        'auction_trend'
    ]

    # 使用逻辑回归或简单加权计算概率
    probability = 0.0
    for feature in base_features:
        value = item.get(feature, 0.0)
        if feature == 'price_volatility_5d':
            probability += (1.0 - min(value, 0.2)) * 0.1  # 波动率越低越好
        else:
            probability += value * 0.12  # 平均权重

    return min(1.0, max(0.0, probability))
```

### 1.5 特征有效性验证

新建 `data-service/scripts/validate_features.py`：

```python
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.feature_selection import mutual_info_classif, f_classif

async def validate_feature_effectiveness(days: int = 30):
    """验证15个增强特征的有效性"""

    # 1. 获取历史数据
    async with get_database() as db:
        cursor = await db.execute("""
            SELECT
                aef.*,
                CASE WHEN k.close >= k.pre_close * 1.095 THEN 1 ELSE 0 END as is_limit_up
            FROM auction_enhanced_features aef
            JOIN klines k ON aef.stock_code = k.stock_code
                AND aef.trade_date = k.date
            WHERE aef.trade_date >= date('now', '-' || ? || ' days')
        """, (days,))

        data = await cursor.fetchall()

    # 2. 转换为DataFrame
    df = pd.DataFrame([dict(row) for row in data])

    # 3. 特征重要性分析
    features = [
        'large_order_ratio', 'fund_concentration', 'fund_inflow_rate',
        'rsi_14', 'price_momentum_3d', 'price_volatility_5d',
        'bollinger_position', 'sector_strength', 'sector_rank',
        'leader_following', 'market_sentiment', 'market_volume_power',
        'limit_up_effect', 'auction_trend', 'opening_strength'
    ]

    X = df[features].fillna(0)
    y = df['is_limit_up']

    # 4. 互信息分析
    mi_scores = mutual_info_classif(X, y)
    mi_df = pd.DataFrame({
        'feature': features,
        'mutual_info': mi_scores
    }).sort_values('mutual_info', ascending=False)

    # 5. ANOVA F值分析
    f_scores, p_values = f_classif(X, y)
    mi_df['f_score'] = f_scores
    mi_df['p_value'] = p_values

    # 6. 相关系数分析
    correlations = {}
    for feature in features:
        corr = np.corrcoef(X[feature], y)[0, 1]
        correlations[feature] = corr

    mi_df['correlation'] = mi_df['feature'].map(correlations)

    return mi_df
```

### 1.6 Phase 1 实施时间表

**第1周（技术准备和基础框架）**：
- 周一：设计数据库表结构，编写SQL语句
- 周二：实现FeatureCalculator基类框架
- 周三：实现资金特征和技术特征计算
- 周四：实现板块特征和市场特征计算
- 周五：实现时序特征计算和综合评分

**第2周（集成和验证）**：
- 周一：编写批量计算脚本和调度任务
- 周二：集成到现有API，新增接口
- 周三：回测验证特征有效性
- 周四：优化特征权重，调整计算逻辑
- 周五：生成Phase 1总结报告

### 1.7 预期效果验证指标

1. **特征覆盖率**：>95%的集合竞价股票能计算完整特征
2. **计算性能**：全市场特征计算时间 < 5分钟
3. **特征有效性**：Top-5特征与涨停相关性 > 0.3
4. **成功率提升**：从17.5%提升至 25-30%
5. **风险降低**：高开低走比例下降 > 20%

**预期效果**：成功率提升至 25-30%

### Phase 2：机器学习模型（2-3周）

#### 2.1 数据准备和特征工程

**数据标注**：
- **正样本**：实际涨停的"冲板优选"股票（历史数据约50-100个）
- **负样本**：未涨停的"冲板优选"股票（历史数据约300-500个）
- **时间窗口**：过去6个月数据（约120个交易日）
- **特征集**：15个增强特征 + 5个原始特征（涨幅、量比、换手率、流通市值、竞价金额）

**特征工程**：
1. **特征标准化**：Z-score标准化处理
2. **缺失值处理**：使用中位数填充
3. **特征交互**：创建关键特征的交互项（如：涨幅×量比、大单占比×资金集中度）
4. **时间序列特征**：前3日特征均值、前5日特征标准差

**样本不均衡处理**：
- **SMOTE过采样**：对正样本进行过采样
- **类别权重**：在模型训练中设置类别权重（正样本:负样本 = 3:1）

#### 2.2 模型架构设计

**集成学习架构**：
```python
class EnhancedLimitUpPredictor:
    """涨停预测集成模型"""

    def __init__(self):
        self.lgb_model = lightgbm.LGBMClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42
        )

        self.xgb_model = xgboost.XGBClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42
        )

        self.ensemble_weights = {'lgb': 0.6, 'xgb': 0.4}

    def predict_proba(self, X):
        """集成预测概率"""
        lgb_proba = self.lgb_model.predict_proba(X)[:, 1]
        xgb_proba = self.xgb_model.predict_proba(X)[:, 1]

        # 加权平均
        ensemble_proba = (
            lgb_proba * self.ensemble_weights['lgb'] +
            xgb_proba * self.ensemble_weights['xgb']
        )
        return ensemble_proba
```

**模型训练策略**：
1. **时间序列交叉验证**：5折时间序列CV，避免未来数据泄露
2. **超参数优化**：使用Optuna进行贝叶斯优化
3. **特征重要性筛选**：保留Top-15最重要特征
4. **早停机制**：验证集损失不再下降时提前停止

#### 2.3 模型部署和服务化

**模型持久化**：
- 使用joblib保存模型和特征处理器
- 模型版本管理：保留最近5个版本
- 模型元数据：存储训练时间、特征列表、性能指标

**预测服务API**：
```python
@router.post("/models/predict-limit-up")
async def predict_limit_up_probability(
    stock_codes: List[str],
    trade_date: str
):
    """批量预测涨停概率"""
    # 1. 加载特征数据
    features = await load_features(stock_codes, trade_date)

    # 2. 加载模型
    model = load_latest_model()

    # 3. 预测概率
    probabilities = model.predict_proba(features)

    # 4. 返回结果
    return [
        {
            "stock_code": code,
            "trade_date": trade_date,
            "limit_up_probability": float(prob),
            "confidence": calculate_confidence(prob),
            "signal": "强烈推荐" if prob >= 0.6 else "谨慎推荐" if prob >= 0.4 else "不建议"
        }
        for code, prob in zip(stock_codes, probabilities)
    ]
```

**模型更新机制**：
- **每日增量训练**：收盘后使用当日数据增量训练
- **每周全量训练**：周末进行全量模型重新训练
- **模型性能监控**：跟踪每日预测准确率，性能下降时触发重新训练

#### 2.4 A/B测试框架

**测试设计**：
- **对照组**：原规则策略（冲板优选标记）
- **实验组**：机器学习模型预测
- **测试周期**：2周（10个交易日）
- **样本量**：每组至少100个预测信号

**评估指标**：
1. **主要指标**：成功率、盈亏比、夏普比率
2. **次要指标**：信号数量、持仓时间、最大回撤
3. **统计显著性**：使用t检验验证差异显著性

**测试报告**：
- 生成详细的A/B测试报告
- 可视化对比两组策略表现
- 提供是否上线新模型的建议

#### 2.5 Phase 2实施时间表

**第1周（数据准备和模型训练）**：
- 周一：历史数据标注和特征提取
- 周二：LightGBM模型训练和调优
- 周三：XGBoost模型训练和调优
- 周四：集成模型设计和训练
- 周五：模型性能初步验证

**第2周（模型部署和测试）**：
- 周一：模型持久化和版本管理
- 周二：预测服务API开发
- 周三：A/B测试框架搭建
- 周四：运行A/B测试，收集数据
- 周五：分析测试结果，优化模型

**第3周（优化和文档）**：
- 周一：根据测试结果优化模型
- 周二：模型监控和告警机制
- 周三：性能优化和缓存策略
- 周四：技术文档编写
- 周五：Phase 2总结报告

**预期效果**：成功率提升至 35-45%

### Phase 3：多策略融合（1-2周）

#### 3.1 策略融合框架设计

**融合架构**：
```
输入层（三大策略）
  ↓
策略评分层（归一化评分）
  ↓
权重分配层（动态权重）
  ↓
融合决策层（投票机制）
  ↓
输出层（最终推荐结果）
```

**策略定义**：
1. **主策略（ML模型）**：冲板优选机器学习模型，权重50%
2. **辅助策略1（智能选股）**：智能选股策略评分，权重30%
3. **辅助策略2（主力行为）**：主力资金连续流入分析，权重20%

**策略接口标准化**：
```python
class StrategyInterface:
    """策略统一接口"""
    def get_strategy_name(self) -> str:
        pass

    def calculate_score(self, stock_code: str, trade_date: str) -> float:
        """计算策略评分（0-100分）"""
        pass

    def get_confidence(self) -> float:
        """获取策略置信度（0-1）"""
        pass

    def get_reasoning(self) -> str:
        """获取策略决策理由"""
        pass
```

#### 3.2 智能选股策略集成

**现有策略分析**：
- **技术面评分**：35%（成交量异动、价格趋势、均线系统）
- **基本面评分**：30%（盈利能力、估值水平、成长性）
- **资金面评分**：25%（主力资金流入、大单占比、机构资金）
- **市场面评分**：10%（板块热度、板块涨跌幅）

**集成方式**：
1. 直接调用现有的 `smart_selection_analyzer.py`
2. 获取综合评分（overall_score）
3. 将评分归一化到0-100分
4. 设置阈值：≥75分为通过

#### 3.3 主力行为分析集成

**分析维度**：
1. **主力资金连续性**：
   - 最近3日主力资金净流入 > 0
   - 最近5日累计流入 > 1000万
   - 流入趋势：递增、持平、递减

2. **大单占比分析**：
   - 当日大单占比 ≥ 30%
   - 最近3日平均大单占比 ≥ 25%
   - 大单占比趋势：上升、稳定、下降

3. **成交量配合**：
   - 量比 ≥ 1.5
   - 竞价金额 > 3000万
   - 换手率 > 2%

**评分规则**：
- 全部满足：100分
- 满足2项：70分
- 满足1项：40分
- 全部不满足：0分

#### 3.4 三重验证融合逻辑

**融合算法**：
```python
class FusionEngine:
    """策略融合引擎"""

    def __init__(self):
        self.strategies = {
            'ml_model': MLStrategy(),
            'smart_selection': SmartSelectionStrategy(),
            'main_force': MainForceStrategy()
        }

        self.dynamic_weights = self._calculate_dynamic_weights()

    def fuse_strategies(self, stock_code: str, trade_date: str) -> FusionResult:
        """融合三大策略结果"""
        results = {}

        # 1. 获取各策略评分
        for name, strategy in self.strategies.items():
            score = strategy.calculate_score(stock_code, trade_date)
            confidence = strategy.get_confidence()
            reasoning = strategy.get_reasoning()

            results[name] = {
                'score': score,
                'confidence': confidence,
                'reasoning': reasoning,
                'weight': self.dynamic_weights[name]
            }

        # 2. 计算加权综合评分
        weighted_score = sum(
            result['score'] * result['weight']
            for result in results.values()
        )

        # 3. 判断是否通过验证
        passes = self._check_validation_rules(results, weighted_score)

        # 4. 生成最终决策
        decision = self._make_decision(passes, weighted_score, results)

        return FusionResult(
            stock_code=stock_code,
            trade_date=trade_date,
            weighted_score=weighted_score,
            decision=decision,
            strategy_details=results
        )

    def _check_validation_rules(self, results: dict, weighted_score: float) -> bool:
        """三重验证规则"""
        # 规则1：主策略必须通过（ML模型概率 ≥ 60%）
        ml_passed = results['ml_model']['score'] >= 60.0

        # 规则2：至少一个辅助策略通过（评分 ≥ 70）
        auxiliary_passed = any(
            results[name]['score'] >= 70
            for name in ['smart_selection', 'main_force']
        )

        # 规则3：加权综合评分 ≥ 65
        fusion_passed = weighted_score >= 65.0

        return ml_passed and (auxiliary_passed or fusion_passed)
```

**决策规则**：
- **强烈推荐**：三重验证通过 + 加权评分 ≥ 80
- **谨慎推荐**：仅主策略通过 + 加权评分 ≥ 60
- **不建议**：主策略未通过 或 加权评分 < 60

#### 3.5 动态权重调整机制

**权重调整因素**：
1. **策略历史表现**：最近10日成功率
2. **市场环境**：波动率、成交量能、上涨股票占比
3. **板块效应**：当日强势板块匹配度
4. **时间因素**：早盘、午盘、尾盘不同权重

**动态权重计算**：
```python
def calculate_dynamic_weights() -> dict:
    """计算动态权重"""
    base_weights = {'ml_model': 0.5, 'smart_selection': 0.3, 'main_force': 0.2}

    # 1. 策略表现调整
    performance_adjustment = {
        name: min(0.2, max(-0.1, (success_rate - 0.5) * 0.2))
        for name, success_rate in strategy_performance.items()
    }

    # 2. 市场环境调整
    market_adjustment = calculate_market_adjustment()

    # 3. 最终权重计算（归一化）
    final_weights = {}
    for name in base_weights:
        weight = base_weights[name] + performance_adjustment.get(name, 0.0)
        final_weights[name] = max(0.1, min(0.7, weight))

    # 归一化处理
    total = sum(final_weights.values())
    return {name: weight/total for name, weight in final_weights.items()}
```

#### 3.6 Phase 3实施时间表

**第1周（框架搭建和策略集成）**：
- 周一：设计策略融合框架和接口
- 周二：集成智能选股策略接口
- 周三：集成主力行为分析模块
- 周四：实现三重验证融合逻辑
- 周五：基础融合功能测试

**第2周（动态调整和优化）**：
- 周一：实现动态权重调整机制
- 周二：添加市场环境感知模块
- 周三：优化融合算法和决策规则
- 周四：回测验证融合效果
- 周五：Phase 3总结报告

**预期效果**：成功率提升至 40-50%，稳定性提高

### Phase 4：动态参数系统（1周）

#### 4.1 系统架构设计

**核心目标**：实现策略参数的动态调整，提高市场适应性和稳定性

**架构组成**：
```
输入层（市场数据 + 策略表现）
  ↓
市场状态感知层（3个感知模块）
  ↓
参数优化层（自适应算法）
  ↓
策略应用层（参数实时更新）
  ↓
监控反馈层（效果评估循环）
```

#### 4.2 市场波动率计算模块

**波动率定义**：全市场股票日收益率的滚动标准差

**计算逻辑**：
```python
class MarketVolatilityCalculator:
    """市场波动率计算器"""

    async def calculate_current_volatility(self) -> float:
        """计算当前市场波动率"""
        async with get_database() as db:
            # 获取最近5个交易日数据
            cursor = await db.execute("""
                SELECT trade_date, AVG(pct_change) as avg_change
                FROM (
                    SELECT
                        date,
                        (close - pre_close) / pre_close * 100 as pct_change
                    FROM klines
                    WHERE date >= date('now', '-5 days')
                    AND pre_close > 0
                )
                GROUP BY trade_date
                ORDER BY trade_date DESC
                LIMIT 5
            """)

            changes = [row['avg_change'] for row in await cursor.fetchall()]

            if len(changes) >= 3:
                # 计算标准差作为波动率
                volatility = np.std(changes)
                return float(volatility)

            return 0.02  # 默认2%波动率
```

**波动率等级划分**：
| 波动率范围 | 等级 | 市场状态 | 参数调整建议 |
|-----------|------|----------|--------------|
| < 0.5% | 极低 | 极度平静 | 放宽条件，增加信号 |
| 0.5%-1.5% | 低 | 正常波动 | 保持默认参数 |
| 1.5%-2.5% | 中 | 活跃市场 | 略微收紧条件 |
| > 2.5% | 高 | 高波动市场 | 大幅收紧条件，降低仓位 |

#### 4.3 成功率反馈循环系统

**设计原理**：基于近期策略表现动态调整参数阈值

**反馈机制**：
```python
class SuccessRateFeedbackLoop:
    """成功率反馈循环系统"""

    def __init__(self):
        self.success_rate_window = 5  # 5日窗口
        self.target_success_rate = 0.25  # 目标成功率25%
        self.adjustment_step = 0.01  # 每次调整步长1%

    async def calculate_adjustments(self) -> dict:
        """计算参数调整量"""
        recent_success_rate = await self._get_recent_success_rate()

        adjustments = {
            'gap_percent_threshold': 0.0,
            'volume_ratio_threshold': 0.0,
            'min_amount_threshold': 0.0
        }

        # 成功率低于目标：放宽条件
        if recent_success_rate < self.target_success_rate * 0.8:
            adjustments['gap_percent_threshold'] = -0.005  # 降低0.5%涨幅要求
            adjustments['volume_ratio_threshold'] = -0.2   # 降低0.2量比要求
            adjustments['min_amount_threshold'] = -1000000  # 降低100万金额要求

        # 成功率高于目标：收紧条件
        elif recent_success_rate > self.target_success_rate * 1.2:
            adjustments['gap_percent_threshold'] = 0.005   # 提高0.5%涨幅要求
            adjustments['volume_ratio_threshold'] = 0.2    # 提高0.2量比要求
            adjustments['min_amount_threshold'] = 1000000  # 提高100万金额要求

        return adjustments

    async def _get_recent_success_rate(self) -> float:
        """获取最近N日成功率"""
        async with get_database() as db:
            cursor = await db.execute("""
                WITH predictions AS (
                    SELECT
                        trade_date,
                        COUNT(*) as total_predictions,
                        SUM(CASE WHEN close >= pre_close * 1.095 THEN 1 ELSE 0 END) as successful_predictions
                    FROM (
                        SELECT
                            aef.trade_date,
                            aef.stock_code,
                            k.pre_close,
                            k.close
                        FROM auction_enhanced_features aef
                        JOIN klines k ON aef.stock_code = k.stock_code
                            AND aef.trade_date = k.date
                        WHERE aef.trade_date >= date('now', '-' || ? || ' days')
                            AND aef.enhanced_score >= 70  -- 预测为涨停的股票
                    )
                    GROUP BY trade_date
                )
                SELECT
                    SUM(successful_predictions) * 1.0 / SUM(total_predictions) as success_rate
                FROM predictions
            """, (self.success_rate_window,))

            result = await cursor.fetchone()
            return float(result['success_rate'] or 0.0) if result else 0.0
```

#### 4.4 板块轮动感知算法

**核心功能**：识别当日强势/弱势板块，差异化调整参数

**算法实现**：
```python
class SectorRotationDetector:
    """板块轮动感知器"""

    async def detect_hot_sectors(self, trade_date: str) -> dict:
        """检测当日热门板块"""
        async with get_database() as db:
            # 1. 计算各板块平均涨幅
            cursor = await db.execute("""
                SELECT
                    s.industry as sector,
                    COUNT(*) as stock_count,
                    AVG((k.close - k.pre_close) / k.pre_close * 100) as avg_change,
                    SUM(k.amount) as total_amount
                FROM stocks s
                JOIN klines k ON s.code = k.stock_code AND k.date = ?
                WHERE s.industry IS NOT NULL AND s.industry != ''
                    AND k.pre_close > 0
                GROUP BY s.industry
                HAVING stock_count >= 5  -- 至少有5只股票的板块
                ORDER BY avg_change DESC
            """, (trade_date,))

            sectors = await cursor.fetchall()

            # 2. 计算板块强度得分
            hot_sectors = {}
            if sectors:
                changes = [s['avg_change'] for s in sectors]
                max_change = max(changes) if changes else 0
                min_change = min(changes) if changes else 0

                for sector in sectors:
                    # 归一化得分 0-100
                    if max_change > min_change:
                        score = (sector['avg_change'] - min_change) / (max_change - min_change) * 100
                    else:
                        score = 50.0

                    # 考虑成交额权重
                    amount_weight = min(sector['total_amount'] / 1e9, 1.0)  # 10亿为上限
                    final_score = score * 0.7 + amount_weight * 100 * 0.3

                    hot_sectors[sector['sector']] = {
                        'score': final_score,
                        'avg_change': sector['avg_change'],
                        'stock_count': sector['stock_count'],
                        'total_amount': sector['total_amount']
                    }

            return hot_sectors

    def get_sector_adjustment(self, stock_sector: str, hot_sectors: dict) -> dict:
        """根据板块热度获取参数调整"""
        adjustment = {
            'gap_percent_threshold': 0.0,
            'enhanced_score_threshold': 0.0
        }

        sector_info = hot_sectors.get(stock_sector)
        if sector_info:
            score = sector_info['score']

            # 强势板块：放宽条件
            if score >= 70:
                adjustment['gap_percent_threshold'] = -0.01  # 降低1%涨幅要求
                adjustment['enhanced_score_threshold'] = -5  # 降低5分评分要求

            # 弱势板块：收紧条件
            elif score <= 30:
                adjustment['gap_percent_threshold'] = 0.01   # 提高1%涨幅要求
                adjustment['enhanced_score_threshold'] = 5   # 提高5分评分要求

        return adjustment
```

#### 4.5 参数自适应调整API

**REST API设计**：

```python
@router.post("/dynamic-params/calculate")
async def calculate_dynamic_parameters(
    trade_date: str = Query(None),
    apply_immediately: bool = Query(False)
):
    """计算动态参数"""

    # 1. 计算市场波动率
    volatility_calculator = MarketVolatilityCalculator()
    volatility = await volatility_calculator.calculate_current_volatility()

    # 2. 计算成功率反馈调整
    feedback_loop = SuccessRateFeedbackLoop()
    feedback_adjustments = await feedback_loop.calculate_adjustments()

    # 3. 检测板块轮动
    sector_detector = SectorRotationDetector()
    target_date = trade_date or datetime.now().strftime("%Y-%m-%d")
    hot_sectors = await sector_detector.detect_hot_sectors(target_date)

    # 4. 综合计算最终参数
    base_params = {
        'gap_percent_threshold': 0.07,      # 7%涨幅要求
        'volume_ratio_threshold': 1.5,      # 1.5量比要求
        'min_amount_threshold': 30000000,   # 3000万金额要求
        'enhanced_score_threshold': 70,     # 70分评分要求
        'market_volatility': volatility,
        'hot_sectors': list(hot_sectors.keys())[:5]  # Top 5热门板块
    }

    # 根据波动率调整
    volatility_adjustments = self._calculate_volatility_adjustments(volatility)

    # 合并所有调整
    final_params = self._merge_adjustments(base_params, feedback_adjustments, volatility_adjustments)

    # 5. 可选：立即应用参数
    if apply_immediately:
        await self._update_strategy_parameters(final_params)

    return {
        "success": True,
        "trade_date": target_date,
        "parameters": final_params,
        "adjustments": {
            "volatility": volatility_adjustments,
            "feedback": feedback_adjustments,
            "volatility_level": self._get_volatility_level(volatility)
        },
        "hot_sectors_summary": {
            "count": len(hot_sectors),
            "top_sectors": [
                {"sector": sector, "score": info["score"]}
                for sector, info in list(hot_sectors.items())[:3]
            ]
        }
    }

@router.get("/dynamic-params/history")
async def get_parameter_history(
    days: int = Query(7, ge=1, le=30)
):
    """获取参数调整历史"""
    async with get_database() as db:
        cursor = await db.execute("""
            SELECT
                trade_date,
                gap_percent_threshold,
                volume_ratio_threshold,
                min_amount_threshold,
                market_volatility,
                success_rate_5d,
                created_at
            FROM dynamic_parameter_history
            WHERE trade_date >= date('now', '-' || ? || ' days')
            ORDER BY trade_date DESC
        """, (days,))

        history = [dict(row) for row in await cursor.fetchall()]

    return {
        "success": True,
        "history": history,
        "summary": {
            "total_days": len(history),
            "avg_gap_threshold": sum(h['gap_percent_threshold'] for h in history) / len(history) if history else 0,
            "avg_volatility": sum(h['market_volatility'] for h in history) / len(history) if history else 0
        }
    }
```

#### 4.6 参数存储和版本管理

**数据库表设计**（添加到database.py）：
```sql
-- 动态参数历史表
CREATE TABLE IF NOT EXISTS dynamic_parameter_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date TEXT NOT NULL UNIQUE,
    -- 核心参数
    gap_percent_threshold REAL NOT NULL,
    volume_ratio_threshold REAL NOT NULL,
    min_amount_threshold REAL NOT NULL,
    enhanced_score_threshold REAL NOT NULL,
    -- 市场状态
    market_volatility REAL NOT NULL,
    success_rate_5d REAL,
    -- 热门板块
    hot_sectors TEXT,  -- JSON数组格式
    -- 元数据
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 参数应用记录表
CREATE TABLE IF NOT EXISTS parameter_application_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parameter_set_id INTEGER NOT NULL,
    stock_count INTEGER NOT NULL,
    signal_count INTEGER NOT NULL,
    application_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parameter_set_id) REFERENCES dynamic_parameter_history(id)
);
```

#### 4.7 集成到冲板优选算法

**在 `get_auction_super_main_force` 中集成**：

```python
def _apply_dynamic_parameters(self, stock_item: dict, dynamic_params: dict, hot_sectors: dict) -> dict:
    """应用动态参数到单个股票"""

    # 获取股票所属板块
    stock_sector = stock_item.get('industry', '')

    # 获取板块特定调整
    sector_adjuster = SectorRotationDetector()
    sector_adjustment = sector_adjuster.get_sector_adjustment(stock_sector, hot_sectors)

    # 计算最终参数
    final_gap_threshold = dynamic_params['gap_percent_threshold'] + sector_adjustment['gap_percent_threshold']
    final_score_threshold = dynamic_params['enhanced_score_threshold'] + sector_adjustment['enhanced_score_threshold']

    # 应用参数检查
    meets_criteria = (
        stock_item['gap_percent'] >= final_gap_threshold and
        stock_item['volume_ratio'] >= dynamic_params['volume_ratio_threshold'] and
        stock_item['amount'] >= dynamic_params['min_amount_threshold'] and
        stock_item.get('enhanced_score', 0) >= final_score_threshold
    )

    return {
        'meets_criteria': meets_criteria,
        'applied_parameters': {
            'gap_percent_threshold': final_gap_threshold,
            'volume_ratio_threshold': dynamic_params['volume_ratio_threshold'],
            'min_amount_threshold': dynamic_params['min_amount_threshold'],
            'enhanced_score_threshold': final_score_threshold
        },
        'adjustments': {
            'sector_adjustment': sector_adjustment,
            'sector': stock_sector,
            'sector_hot': stock_sector in hot_sectors
        }
    }
```

#### 4.8 Phase 4实施时间表

**第1周（完整实施）**：

**周一：市场波动率模块**
- 实现MarketVolatilityCalculator类
- 添加波动率等级划分逻辑
- 创建波动率历史存储

**周二：成功率反馈系统**
- 实现SuccessRateFeedbackLoop类
- 添加5日成功率计算逻辑
- 实现参数调整算法

**周三：板块轮动感知**
- 实现SectorRotationDetector类
- 添加板块强度计算算法
- 实现差异化参数调整

**周四：API集成和存储**
- 设计REST API接口
- 实现参数存储表结构
- 添加参数版本管理

**周五：测试和优化**
- 集成测试动态参数系统
- 回测验证参数调整效果
- 优化算法参数和阈值

#### 4.9 预期效果和监控指标

**主要目标**：
- 策略适应性提升：不同市场环境下成功率波动减少30%
- 回撤控制改善：最大回撤降低15-20%
- 信号质量提高：筛选出的股票涨停概率提升5-10%

**监控指标**：
```python
监控指标 = {
    '参数调整频率': '每日1次（盘前）',
    '波动率敏感度': '参数随波动率变化的幅度',
    '成功率稳定性': '5日成功率标准差',
    '板块覆盖率': '参数调整影响的板块比例',
    '信号质量变化': '动态参数 vs 静态参数的涨停率对比'
}
```

**预警机制**：
- 参数调整幅度 > 20%：触发人工审核
- 成功率连续3日 < 10%：暂停策略，切换为保守模式
- 波动率 > 3.0%：自动启用高风险模式（更严格条件）

## 技术实现细节

### 关键文件修改

#### 1. 核心算法文件（必须修改）
- `data-service/src/routes/analysis.py`
  - 新增`enhanced_auction_super_main_force()`函数
  - 集成ML预测和多策略融合
  - 保留原函数兼容性

#### 2. 机器学习模块（新建）
- `data-service/src/models/enhanced_predictor.py`
  - 特征工程管道
  - LightGBM/XGBoost模型封装
  - 模型训练和预测API

#### 3. 数据库扩展
- `data-service/src/utils/database.py`
  - 新增`auction_enhanced_features`表
  - 存储15个增强特征
  - 添加索引优化查询

#### 4. 策略融合模块（新建）
- `data-service/src/strategies/fusion_engine.py`
  - 多策略权重管理
  - 三重验证逻辑
  - 动态参数调整

#### 5. 前端展示更新（可选）
- `frontend/src/pages/SuperMainForce.tsx`
  - 显示涨停概率百分比
  - 展示三重验证结果
  - 添加策略置信度指示器

### 回测验证方案

使用现有`backtest_engine.py`框架，扩展支持：

1. **增强策略回测**：对比原策略vs增强策略
2. **特征有效性测试**：逐个验证新特征贡献度
3. **参数敏感性分析**：测试不同阈值组合
4. **时间外样本测试**：确保无过拟合

**回测指标**：
- 主要：成功率、盈亏比、夏普比率
- 辅助：信号数量、持仓时间、最大回撤
- 风险：单日最大亏损、连续失败次数

### 风险控制措施

1. **模型过拟合防护**：
   - 时间序列交叉验证
   - 特征重要性筛选
   - 正则化参数调优
   - 保留测试集不参与训练

2. **实时监控告警**：
   - 预测置信度 < 50%时告警
   - 连续3日成功率 < 10%时暂停
   - 特征数据缺失 > 30%时降级

3. **降级策略**：
   - ML模型失败时回退到规则策略
   - 数据异常时使用简化特征集
   - 服务不可用时返回缓存结果

## 预期成果指标

### 主要目标（6周后）：
1. **成功率**：从17.5%提升至 ≥40%
2. **盈亏比**：从当前水平提升至 ≥2.0
3. **夏普比率**：从当前水平提升至 ≥1.5
4. **最大回撤**：控制在 ≤10%

### 过程指标：
- **Phase 1结束**：成功率 ≥25%
- **Phase 2结束**：成功率 ≥35%
- **Phase 3结束**：成功率 ≥40%
- **Phase 4结束**：策略稳定性提升30%

### 技术指标：
- **预测延迟**：< 5秒（9:25-9:30之间）
- **模型准确率**：测试集 ≥75%
- **特征覆盖率**：> 95%股票有完整特征
- **系统可用性**：> 99.9%

## 资源需求

### 开发资源：
- **后端开发**：2人周（Python、机器学习）
- **数据工程**：1人周（特征计算、数据管道）
- **测试验证**：1人周（回测、AB测试）

### 技术依赖：
- **机器学习库**：lightgbm, xgboost, scikit-learn
- **数据处理**：pandas, numpy, scipy
- **特征计算**：TA-Lib（技术指标）

### 硬件要求：
- **训练阶段**：8GB RAM，4核CPU（单次训练<30分钟）
- **预测阶段**：4GB RAM，2核CPU（实时预测）
- **存储**：额外100MB特征数据存储

## 下一步行动

1. **方案确认**：用户确认整体方向和优先级
2. **详细设计**：选中的Phase进行详细技术设计
3. **原型开发**：先实现核心功能验证效果
4. **迭代优化**：根据回测结果逐步优化

> **风险提示**：任何预测模型都有失效风险，建议实盘前充分回测，初期小资金验证。