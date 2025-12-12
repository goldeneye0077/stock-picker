"""
高级智能选股API路由
提供基于多因子动量模型的高级选股API接口
参考幻方量化等优秀量化算法设计
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging
import asyncio

try:
    # 首先尝试相对导入
    from ..analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/advanced", tags=["advanced-selection"])


# 依赖注入
def get_advanced_selection_analyzer():
    """获取高级智能选股分析器"""
    return AdvancedSelectionAnalyzer()


@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "service": "advanced-selection", "timestamp": datetime.now().isoformat()}


@router.get("/strategies")
async def get_strategies(
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    获取高级选股策略列表

    Returns:
        策略列表
    """
    try:
        strategies = await advanced_selection_analyzer.get_selection_strategies()

        return {
            "count": len(strategies),
            "strategies": strategies,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"获取高级选股策略列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取策略列表失败: {str(e)}")


@router.post("/run")
async def run_advanced_selection(
    min_score: float = Query(60.0, ge=0, le=100, description="最低综合评分"),
    max_results: int = Query(20, ge=1, le=100, description="最大结果数"),
    require_uptrend: bool = Query(True, description="是否要求上升趋势"),
    require_hot_sector: bool = Query(True, description="是否要求热门板块"),
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    运行高级智能选股

    Args:
        min_score: 最低综合评分
        max_results: 最大结果数
        require_uptrend: 是否要求上升趋势
        require_hot_sector: 是否要求热门板块

    Returns:
        选股结果
    """
    try:
        logger.info(f"开始运行高级选股，参数: min_score={min_score}, max_results={max_results}, "
                   f"require_uptrend={require_uptrend}, require_hot_sector={require_hot_sector}")

        # 运行高级选股（添加超时保护）
        logger.info("调用 run_advanced_selection 方法...")
        import asyncio
        try:
            results = await asyncio.wait_for(
                advanced_selection_analyzer.run_advanced_selection(
                    min_score=min_score,
                    max_results=max_results,
                    require_uptrend=require_uptrend,
                    require_hot_sector=require_hot_sector
                ),
                timeout=30.0  # 30秒超时
            )
            logger.info(f"run_advanced_selection 方法返回，结果数量: {len(results)}")
        except asyncio.TimeoutError:
            logger.error("高级选股执行超时（30秒）")
            raise HTTPException(status_code=408, detail="选股执行超时，请稍后重试或减少分析数量")

        return {
            "parameters": {
                "min_score": min_score,
                "max_results": max_results,
                "require_uptrend": require_uptrend,
                "require_hot_sector": require_hot_sector
            },
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"运行高级选股失败: {e}")
        raise HTTPException(status_code=500, detail=f"运行高级选股失败: {str(e)}")


@router.post("/quick-run")
async def quick_run_advanced_selection(
    min_score: float = Query(50.0, ge=0, le=100, description="最低综合评分"),
    max_results: int = Query(5, ge=1, le=20, description="最大结果数"),
    require_uptrend: bool = Query(True, description="是否要求上升趋势"),
    require_hot_sector: bool = Query(True, description="是否要求热门板块"),
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    快速运行高级智能选股（只分析50只股票，用于测试）
    """
    try:
        logger.info(f"快速运行高级选股，参数: min_score={min_score}, max_results={max_results}, "
                   f"require_uptrend={require_uptrend}, require_hot_sector={require_hot_sector}")

        # 获取股票列表
        stocks = await advanced_selection_analyzer._get_stock_list()
        if not stocks:
            return {
                "parameters": {
                    "min_score": min_score,
                    "max_results": max_results,
                    "require_uptrend": require_uptrend,
                    "require_hot_sector": require_hot_sector
                },
                "count": 0,
                "results": [],
                "timestamp": datetime.now().isoformat(),
                "message": "未找到股票数据"
            }

        # 只分析前50只股票（加快速度）
        sample_size = min(50, len(stocks))
        test_stocks = stocks[:sample_size]
        logger.info(f"分析前{sample_size}只股票")

        results = []
        for i, stock in enumerate(test_stocks):
            if not stock.get('stock_code'):
                continue

            # 分析单只股票
            result = await advanced_selection_analyzer.analyze_stock(stock)

            if result:
                # 应用筛选条件
                if result['composite_score'] >= min_score:
                    if require_uptrend and result['trend_slope'] < -0.05:
                        continue  # 跳过明显下降趋势
                    if require_hot_sector and result['sector_heat'] < 30:
                        continue  # 跳过冷门板块

                    results.append(result)

            # 进度提示
            if (i + 1) % 10 == 0:
                logger.info(f"分析进度: {i+1}/{sample_size}，已找到 {len(results)} 只符合条件的股票")

            # 避免过度消耗资源
            await asyncio.sleep(0.001)

        # 按评分排序
        results.sort(key=lambda x: x['composite_score'], reverse=True)
        # 限制结果数量
        results = results[:max_results]

        logger.info(f"快速选股完成，找到 {len(results)} 只符合条件的股票")

        return {
            "parameters": {
                "min_score": min_score,
                "max_results": max_results,
                "require_uptrend": require_uptrend,
                "require_hot_sector": require_hot_sector
            },
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat(),
            "message": f"快速分析完成（共分析{sample_size}只股票）"
        }

    except Exception as e:
        logger.error(f"快速运行高级选股失败: {e}")
        raise HTTPException(status_code=500, detail=f"快速运行高级选股失败: {str(e)}")


@router.post("/run-strategy/{strategy_id}")
async def run_strategy_by_id(
    strategy_id: int,
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    按策略ID运行高级选股

    Args:
        strategy_id: 策略ID

    Returns:
        选股结果
    """
    try:
        # 获取策略列表
        strategies = await advanced_selection_analyzer.get_selection_strategies()

        # 查找指定策略
        strategy = None
        for s in strategies:
            if s['id'] == strategy_id:
                strategy = s
                break

        if not strategy:
            raise HTTPException(status_code=404, detail=f"未找到ID为{strategy_id}的策略")

        if not strategy.get('is_active', True):
            raise HTTPException(status_code=400, detail=f"策略{strategy_id}未启用")

        logger.info(f"按策略运行高级选股，策略: {strategy['strategy_name']}")

        # 运行高级选股
        results = await advanced_selection_analyzer.run_advanced_selection(
            min_score=strategy['min_score'],
            max_results=strategy['max_results'],
            require_uptrend=strategy['require_uptrend'],
            require_hot_sector=strategy['require_hot_sector']
        )

        return {
            "strategy": strategy,
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"按策略运行高级选股失败: {e}")
        raise HTTPException(status_code=500, detail=f"按策略运行高级选股失败: {str(e)}")


@router.get("/analyze/{stock_code}")
async def analyze_single_stock(
    stock_code: str,
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    分析单只股票

    Args:
        stock_code: 股票代码（格式：000001.SZ 或 600519.SH）

    Returns:
        股票分析结果
    """
    try:
        # 解析股票代码
        if '.' in stock_code:
            code_part = stock_code.split('.')[0]
            exchange = stock_code.split('.')[1]
        else:
            code_part = stock_code
            exchange = 'SZ' if stock_code.startswith('00') or stock_code.startswith('30') else 'SH'

        # 构建股票信息
        stock_info = {
            'stock_code': stock_code,
            'stock_name': '',  # 名称将在分析器中获取
            'industry': '',    # 行业将在分析器中获取
            'raw_code': code_part
        }

        logger.info(f"开始分析单只股票: {stock_code}")

        # 分析股票
        result = await advanced_selection_analyzer.analyze_stock(stock_info)

        if not result:
            raise HTTPException(status_code=404, detail=f"股票{stock_code}分析失败或数据不足")

        return {
            "stock_code": stock_code,
            "analysis": result,
            "timestamp": datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"分析单只股票失败: {e}")
        raise HTTPException(status_code=500, detail=f"分析单只股票失败: {str(e)}")


@router.get("/compare-algorithms")
async def compare_algorithms(
    min_score: float = Query(60.0, ge=0, le=100, description="最低综合评分"),
    max_results: int = Query(10, ge=1, le=50, description="最大结果数"),
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    对比新旧算法效果

    Args:
        min_score: 最低综合评分
        max_results: 最大结果数

    Returns:
        算法对比结果
    """
    try:
        logger.info(f"开始对比新旧算法，参数: min_score={min_score}, max_results={max_results}")

        # 运行高级选股（新算法）
        advanced_results = await advanced_selection_analyzer.run_advanced_selection(
            min_score=min_score,
            max_results=max_results,
            require_uptrend=False,
            require_hot_sector=False
        )

        # 这里应该运行旧算法进行对比
        # 暂时只返回新算法结果和对比说明

        comparison = {
            "old_algorithm": {
                "name": "简单加权算法",
                "weights": "技术面35%、基本面30%、资金面25%、市场面10%",
                "description": "基于简单加权评分的传统选股算法"
            },
            "new_algorithm": {
                "name": "多因子动量算法",
                "weights": "动量35%、趋势质量25%、板块热度20%、基本面20%",
                "description": "基于多因子动量模型的高级选股算法，参考幻方量化等优秀算法设计"
            },
            "improvements": [
                "增加动量因子（20日/60日收益率、RSI、MACD）",
                "增加趋势质量因子（趋势斜率、R2、夏普比率）",
                "强化板块热度分析",
                "增加风险控制（波动率、最大回撤）",
                "参考幻方量化等优秀量化算法设计"
            ],
            "advanced_results_count": len(advanced_results),
            "advanced_results_sample": advanced_results[:3] if advanced_results else [],
            "timestamp": datetime.now().isoformat()
        }

        return comparison

    except Exception as e:
        logger.error(f"对比算法失败: {e}")
        raise HTTPException(status_code=500, detail=f"对比算法失败: {str(e)}")


@router.get("/statistics")
async def get_advanced_selection_statistics(
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    获取高级选股统计信息

    Returns:
        统计信息
    """
    try:
        # 获取策略列表
        strategies = await advanced_selection_analyzer.get_selection_strategies()

        # 运行各策略获取统计信息
        strategy_stats = []
        for strategy in strategies[:2]:  # 只运行前两个策略获取样本数据
            try:
                results = await advanced_selection_analyzer.run_advanced_selection(
                    min_score=strategy['min_score'],
                    max_results=5,  # 限制数量，提高性能
                    require_uptrend=strategy['require_uptrend'],
                    require_hot_sector=strategy['require_hot_sector']
                )

                if results:
                    avg_composite = sum(r['composite_score'] for r in results) / len(results)
                    avg_momentum = sum(r['momentum_score'] for r in results) / len(results)
                    avg_sector = sum(r['sector_score'] for r in results) / len(results)

                    strategy_stats.append({
                        "strategy_id": strategy['id'],
                        "strategy_name": strategy['strategy_name'],
                        "sample_count": len(results),
                        "avg_composite_score": round(avg_composite, 1),
                        "avg_momentum_score": round(avg_momentum, 1),
                        "avg_sector_score": round(avg_sector, 1)
                    })
            except Exception as e:
                logger.warning(f"获取策略{strategy['strategy_name']}统计信息失败: {e}")
                continue

        statistics = {
            "total_strategies": len(strategies),
            "active_strategies": len([s for s in strategies if s.get('is_active', True)]),
            "strategy_statistics": strategy_stats,
            "algorithm_description": "多因子动量模型（动量35%、趋势质量25%、板块热度20%、基本面20%）",
            "reference_algorithms": ["幻方量化", "九坤投资", "明汯投资"],
            "key_features": [
                "20+技术因子计算",
                "动量与趋势质量分析",
                "板块热度与轮动识别",
                "风险控制与回撤管理",
                "机器学习算法参考"
            ],
            "timestamp": datetime.now().isoformat()
        }

        return statistics

    except Exception as e:
        logger.error(f"获取高级选股统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")