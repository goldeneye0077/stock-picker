"""
简化版选股API路由
用于快速测试
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any
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

router = APIRouter(prefix="/simple", tags=["simple-selection"])


# 依赖注入
def get_advanced_selection_analyzer():
    """获取高级智能选股分析器"""
    return AdvancedSelectionAnalyzer()


@router.post("/quick-run")
async def quick_run_advanced_selection(
    min_score: float = Query(50.0, ge=0, le=100, description="最低综合评分"),
    max_results: int = Query(5, ge=1, le=20, description="最大结果数"),
    require_uptrend: bool = Query(True, description="是否要求上升趋势"),
    require_hot_sector: bool = Query(True, description="是否要求热门板块"),
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    快速运行高级智能选股（简化版，只分析50只股票）
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
                    if require_uptrend and result['trend_slope'] < 0.2:  # 提高到 0.2
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