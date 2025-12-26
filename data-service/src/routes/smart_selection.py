"""
智能选股API路由
提供智能选股功能的API接口
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

try:
    # 首先尝试相对导入
    from ..analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer
    from ..analyzers.smart_selection.backtest_engine import BacktestEngine
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer
    from analyzers.smart_selection.backtest_engine import BacktestEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["smart-selection"])


# 依赖注入
def get_smart_selection_analyzer():
    """获取智能选股分析器"""
    return SmartSelectionAnalyzer()

def get_backtest_engine():
    """获取回测引擎"""
    try:
        logger.info("创建新的回测引擎实例")
        engine = BacktestEngine()
        logger.info(f"回测引擎创建成功，数据库路径: {engine.db_path}")
        return engine
    except Exception as e:
        logger.error(f"创建回测引擎失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise


@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "service": "smart-selection", "timestamp": datetime.now().isoformat()}


@router.get("/strategies")
async def get_strategies(
    smart_selection_analyzer: SmartSelectionAnalyzer = Depends(get_smart_selection_analyzer)
):
    """
    获取选股策略列表

    Returns:
        策略列表
    """
    try:
        strategies = await smart_selection_analyzer.get_selection_strategies()

        return {
            "count": len(strategies),
            "strategies": strategies,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"获取选股策略列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取策略列表失败: {str(e)}")


@router.post("/run")
async def run_smart_selection(
    strategy_config: Dict[str, Any],
    smart_selection_analyzer: SmartSelectionAnalyzer = Depends(get_smart_selection_analyzer)
):
    """
    运行智能选股

    Args:
        strategy_config: 策略配置

    Returns:
        选股结果
    """
    try:
        # 验证策略配置
        if not strategy_config:
            raise HTTPException(status_code=400, detail="策略配置不能为空")

        weights = strategy_config.get('weights', {
            'technical': 0.35,
            'fundamental': 0.30,
            'capital': 0.25,
            'market': 0.10,
        })

        # 验证权重总和为1
        weight_sum = sum(weights.values())
        if abs(weight_sum - 1.0) > 0.01:
            raise HTTPException(status_code=400, detail=f"权重总和必须为1，当前为{weight_sum}")

        min_score = strategy_config.get('min_score', 70.0)
        if min_score < 0 or min_score > 100:
            raise HTTPException(status_code=400, detail="最低评分必须在0-100之间")

        max_results = strategy_config.get('max_results', 20)
        if max_results < 1 or max_results > 100:
            raise HTTPException(status_code=400, detail="最大结果数必须在1-100之间")

        logger.info(f"开始运行智能选股，配置: {strategy_config}")

        # 运行智能选股
        results = await smart_selection_analyzer.run_smart_selection(strategy_config)

        return {
            "strategy_config": strategy_config,
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"运行智能选股失败: {e}")
        raise HTTPException(status_code=500, detail=f"运行智能选股失败: {str(e)}")


@router.get("/results")
async def get_selection_results(
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    min_score: float = Query(70.0, ge=0, le=100, description="最低评分"),
    smart_selection_analyzer: SmartSelectionAnalyzer = Depends(get_smart_selection_analyzer)
):
    """
    获取选股结果（模拟数据）

    Args:
        limit: 返回数量
        min_score: 最低评分

    Returns:
        选股结果
    """
    try:
        # 这里应该从数据库获取历史选股结果
        # 暂时返回模拟数据

        mock_results = [
            {
                "id": 1,
                "stock_code": "000001.SZ",
                "stock_name": "平安银行",
                "overall_score": 85.6,
                "technical_score": 82.0,
                "fundamental_score": 88.0,
                "capital_score": 86.0,
                "market_score": 80.0,
                "selection_reason": "技术面突破+基本面优秀+资金持续流入",
                "risk_level": "中",
                "target_price": 15.8,
                "stop_loss_price": 13.2,
                "holding_period": "中线",
                "selection_date": datetime.now().strftime('%Y-%m-%d'),
            },
            {
                "id": 2,
                "stock_code": "600519.SH",
                "stock_name": "贵州茅台",
                "overall_score": 82.3,
                "technical_score": 78.0,
                "fundamental_score": 92.0,
                "capital_score": 80.0,
                "market_score": 75.0,
                "selection_reason": "基本面极其优秀，估值合理",
                "risk_level": "低",
                "target_price": 1850.0,
                "stop_loss_price": 1650.0,
                "holding_period": "长线",
                "selection_date": datetime.now().strftime('%Y-%m-%d'),
            },
            {
                "id": 3,
                "stock_code": "000858.SZ",
                "stock_name": "五粮液",
                "overall_score": 79.8,
                "technical_score": 85.0,
                "fundamental_score": 85.0,
                "capital_score": 75.0,
                "market_score": 70.0,
                "selection_reason": "技术面强势突破，资金关注度高",
                "risk_level": "中",
                "target_price": 168.0,
                "stop_loss_price": 145.0,
                "holding_period": "中线",
                "selection_date": datetime.now().strftime('%Y-%m-%d'),
            },
            {
                "id": 4,
                "stock_code": "002415.SZ",
                "stock_name": "海康威视",
                "overall_score": 77.5,
                "technical_score": 80.0,
                "fundamental_score": 78.0,
                "capital_score": 82.0,
                "market_score": 65.0,
                "selection_reason": "资金持续流入，技术形态良好",
                "risk_level": "中",
                "target_price": 38.5,
                "stop_loss_price": 32.0,
                "holding_period": "短线",
                "selection_date": datetime.now().strftime('%Y-%m-%d'),
            },
            {
                "id": 5,
                "stock_code": "300750.SZ",
                "stock_name": "宁德时代",
                "overall_score": 76.2,
                "technical_score": 72.0,
                "fundamental_score": 80.0,
                "capital_score": 78.0,
                "market_score": 70.0,
                "selection_reason": "新能源板块热度回升，基本面稳健",
                "risk_level": "高",
                "target_price": 220.0,
                "stop_loss_price": 185.0,
                "holding_period": "中线",
                "selection_date": datetime.now().strftime('%Y-%m-%d'),
            },
        ]

        # 过滤和限制结果
        filtered_results = [r for r in mock_results if r['overall_score'] >= min_score]
        filtered_results = filtered_results[:limit]

        return {
            "limit": limit,
            "min_score": min_score,
            "count": len(filtered_results),
            "results": filtered_results,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"获取选股结果失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取选股结果失败: {str(e)}")


@router.post("/backtest")
async def run_backtest(
    strategy_config: Dict[str, Any],
    start_date: str = Query(..., description="开始日期，格式: YYYY-MM-DD"),
    end_date: str = Query(..., description="结束日期，格式: YYYY-MM-DD"),
    algorithm_type: str = Query('basic', description="算法类型: basic(基础算法) 或 advanced(高级算法)"),
    backtest_engine: BacktestEngine = Depends(get_backtest_engine)
):
    """
    运行策略回测

    Args:
        strategy_config: 策略配置
        start_date: 开始日期
        end_date: 结束日期
        algorithm_type: 算法类型

    Returns:
        回测结果
    """
    try:
        logger.info("=== 开始处理回测请求 ===")
        logger.info(f"请求参数: start_date={start_date}, end_date={end_date}, algorithm_type={algorithm_type}")
        logger.info(f"策略配置: {strategy_config}")
        logger.info(f"回测引擎实例: {backtest_engine}")
        logger.info(f"回测引擎类型: {type(backtest_engine)}")

        # 验证日期格式
        try:
            datetime.strptime(start_date, '%Y-%m-%d')
            datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="日期格式错误，应为YYYY-MM-DD")

        # 验证算法类型
        if algorithm_type not in ['basic', 'advanced']:
            raise HTTPException(status_code=400, detail="算法类型必须是 'basic' 或 'advanced'")

        # 验证策略配置
        if not strategy_config:
            raise HTTPException(status_code=400, detail="策略配置不能为空")

        # 验证权重配置（基础算法需要）
        if algorithm_type == 'basic':
            weights = strategy_config.get('weights', {
                'technical': 0.35,
                'fundamental': 0.30,
                'capital': 0.25,
                'market': 0.10,
            })

            # 验证权重总和为1
            weight_sum = sum(weights.values())
            if abs(weight_sum - 1.0) > 0.01:
                raise HTTPException(status_code=400, detail=f"权重总和必须为1，当前为{weight_sum}")

        min_score = strategy_config.get('min_score', 70.0)
        if min_score < 0 or min_score > 100:
            raise HTTPException(status_code=400, detail="最低评分必须在0-100之间")

        max_results = strategy_config.get('max_results', 20)
        if max_results < 1 or max_results > 100:
            raise HTTPException(status_code=400, detail="最大结果数必须在1-100之间")

        logger.info(f"开始运行策略回测: {start_date} 到 {end_date}, 算法类型: {algorithm_type}")
        logger.info(f"策略配置: {strategy_config}")

        # 调试：检查回测引擎
        logger.info(f"回测引擎: {backtest_engine}")
        logger.info(f"回测引擎数据库路径: {backtest_engine.db_path}")

        # 运行回测
        logger.info("调用 backtest_engine.run_backtest()...")
        result = await backtest_engine.run_backtest(
            strategy_config, start_date, end_date, algorithm_type
        )
        logger.info(
            f"回测完成 - 总收益率: {result['total_return']:.2f}%, 交易次数: {result['total_trades']}"
        )
        logger.info("=== 回测请求处理完成 ===")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"运行策略回测失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # 返回错误结果而不是抛出异常，以便查看错误信息
        return {
            'strategy_config': strategy_config,
            'start_date': start_date,
            'end_date': end_date,
            'total_return': 0.0,
            'annual_return': 0.0,
            'max_drawdown': 0.0,
            'sharpe_ratio': 0.0,
            'win_rate': 0.0,
            'total_trades': 0,
            'profit_trades': 0,
            'loss_trades': 0,
            'average_profit': 0.0,
            'average_loss': 0.0,
            'profit_factor': 0.0,
            'backtest_completed': False,
            'message': f"运行策略回测失败: {str(e)}",
            'timestamp': datetime.now().isoformat()
        }


@router.get("/statistics")
async def get_selection_statistics(
    smart_selection_analyzer: SmartSelectionAnalyzer = Depends(get_smart_selection_analyzer)
):
    """
    获取选股统计信息

    Returns:
        统计信息
    """
    try:
        # 这里应该从数据库获取统计信息
        # 暂时返回模拟数据

        statistics = {
            "total_selections": 156,  # 总选股次数
            "average_score": 78.5,  # 平均评分
            "high_score_count": 42,  # 高分(>80)数量
            "medium_score_count": 89,  # 中分(60-80)数量
            "low_score_count": 25,  # 低分(<60)数量
            "low_risk_count": 68,  # 低风险数量
            "medium_risk_count": 75,  # 中风险数量
            "high_risk_count": 13,  # 高风险数量
            "short_term_count": 45,  # 短线建议数量
            "medium_term_count": 87,  # 中线建议数量
            "long_term_count": 24,  # 长线建议数量
            "most_selected_industry": "银行",  # 最多入选行业
            "best_performing_strategy": "均衡策略",  # 表现最佳策略
            "timestamp": datetime.now().isoformat()
        }

        return statistics

    except Exception as e:
        logger.error(f"获取选股统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")
