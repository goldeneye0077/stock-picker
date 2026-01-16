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
import os
import uuid
from pathlib import Path
import aiosqlite

try:
    # 首先尝试相对导入
    from ..analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer

logger = logging.getLogger(__name__)

ADVANCED_SELECTION_TIMEOUT = float(os.getenv("ADVANCED_SELECTION_TIMEOUT", "1200"))

router = APIRouter(prefix="/advanced", tags=["advanced-selection"])

advanced_selection_jobs: Dict[str, Dict[str, Any]] = {}


async def _get_db_path() -> Path:
    try:
        from ..utils.database import DATABASE_PATH
    except ImportError:
        from utils.database import DATABASE_PATH
    return DATABASE_PATH


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
    require_breakout: bool = Query(False, description="是否要求突破信号"),
    strategy_id: Optional[int] = Query(None, description="策略ID（可选，用于记录历史）"),
    strategy_name: Optional[str] = Query(None, description="策略名称（可选，用于记录历史）"),
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    """
    运行高级智能选股

    Args:
        min_score: 最低综合评分
        max_results: 最大结果数
        require_uptrend: 是否要求上升趋势
        require_hot_sector: 是否要求热门板块
        require_breakout: 是否要求突破信号

    Returns:
        选股结果
    """
    try:
        logger.info(f"开始运行高级选股，参数: min_score={min_score}, max_results={max_results}, "
                   f"require_uptrend={require_uptrend}, require_hot_sector={require_hot_sector}, "
                   f"require_breakout={require_breakout}")

        # 运行高级选股（添加超时保护）
        logger.info("调用 run_advanced_selection 方法...")
        try:
            results = await asyncio.wait_for(
                advanced_selection_analyzer.run_advanced_selection(
                    min_score=min_score,
                    max_results=max_results,
                    require_uptrend=require_uptrend,
                    require_hot_sector=require_hot_sector,
                    require_breakout=require_breakout,
                    strategy_id=strategy_id,
                    progress_callback=None,
                ),
                timeout=ADVANCED_SELECTION_TIMEOUT
            )
            logger.info(f"run_advanced_selection 方法返回，结果数量: {len(results)}")
        except asyncio.TimeoutError:
            logger.error(f"高级选股执行超时（{ADVANCED_SELECTION_TIMEOUT}秒）")
            raise HTTPException(
                status_code=408,
                detail=f"选股执行超时（超过{ADVANCED_SELECTION_TIMEOUT}秒），请稍后重试或减少分析数量"
            )

        run_id = uuid.uuid4().hex
        selection_date = datetime.now().strftime("%Y-%m-%d")

        try:
            db_path = await _get_db_path()
            async with aiosqlite.connect(db_path) as db:
                await db.execute("PRAGMA journal_mode=WAL;")

                for item in results:
                    stock_code = item.get("stock_code") or item.get("raw_code") or ""
                    stock_name = item.get("stock_name") or item.get("name") or ""
                    composite_score = float(item.get("composite_score") or 0)
                    selection_reason = item.get("selection_reason") or ""

                    risk_level = item.get("risk_level")
                    holding_period = item.get("holding_period")
                    target_price = item.get("target_price")
                    stop_loss_price = item.get("stop_loss_price")

                    parts = []
                    if risk_level:
                        parts.append(f"风险等级: {risk_level}")
                    if holding_period:
                        parts.append(f"持有周期: {holding_period}")
                    if target_price is not None:
                        parts.append(f"目标价: {target_price:.2f}")
                    if stop_loss_price is not None:
                        parts.append(f"止损价: {stop_loss_price:.2f}")
                    risk_advice = "；".join(parts) if parts else None

                    await db.execute(
                        """
                        INSERT INTO advanced_selection_history (
                            run_id,
                            strategy_id,
                            strategy_name,
                            stock_code,
                            stock_name,
                            composite_score,
                            selection_date,
                            risk_advice,
                            selection_reason
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run_id,
                            strategy_id,
                            strategy_name,
                            stock_code,
                            stock_name,
                            composite_score,
                            selection_date,
                            risk_advice,
                            selection_reason,
                        ),
                    )

                await db.commit()
                logger.info(f"已保存高级选股历史记录，run_id={run_id}，数量={len(results)}")
        except Exception as e:
            logger.error(f"保存高级选股历史记录失败: {e}")

        return {
            "parameters": {
                "min_score": min_score,
                "max_results": max_results,
                "require_uptrend": require_uptrend,
                "require_hot_sector": require_hot_sector,
                "require_breakout": require_breakout
            },
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat(),
            "run_id": run_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"运行高级选股失败: {e}")
        raise HTTPException(status_code=500, detail=f"运行高级选股失败: {str(e)}")


@router.post("/run-async")
async def run_advanced_selection_async(
    min_score: float = Query(60.0, ge=0, le=100, description="最低综合评分"),
    max_results: int = Query(20, ge=1, le=100, description="最大结果数"),
    require_uptrend: bool = Query(True, description="是否要求上升趋势"),
    require_hot_sector: bool = Query(True, description="是否要求热门板块"),
    require_breakout: bool = Query(False, description="是否要求突破信号"),
    strategy_id: Optional[int] = Query(None, description="策略ID（可选，用于记录历史）"),
    strategy_name: Optional[str] = Query(None, description="策略名称（可选，用于记录历史）"),
    advanced_selection_analyzer: AdvancedSelectionAnalyzer = Depends(get_advanced_selection_analyzer)
):
    try:
        job_id = uuid.uuid4().hex
        created_at = datetime.now().isoformat()
        advanced_selection_jobs[job_id] = {
            "job_id": job_id,
            "status": "pending",
            "progress": 0.0,
            "processed": 0,
            "total": 0,
            "selected": 0,
            "result_count": 0,
            "results": None,
            "error": None,
            "parameters": {
                "min_score": min_score,
                "max_results": max_results,
                "require_uptrend": require_uptrend,
                "require_hot_sector": require_hot_sector,
                "require_breakout": require_breakout,
                "strategy_id": strategy_id,
                "strategy_name": strategy_name,
            },
            "created_at": created_at,
            "updated_at": created_at,
        }

        async def job_runner() -> None:
            try:
                job = advanced_selection_jobs.get(job_id)
                if job is None:
                    return
                job["status"] = "running"
                job["updated_at"] = datetime.now().isoformat()

                def progress_callback(processed: int, total: int, selected: int) -> None:
                    current = advanced_selection_jobs.get(job_id)
                    if current is None:
                        return
                    current["processed"] = processed
                    current["total"] = total
                    current["selected"] = selected
                    current["progress"] = float(processed) / float(total) if total > 0 else 0.0
                    current["updated_at"] = datetime.now().isoformat()

                results = await advanced_selection_analyzer.run_advanced_selection(
                    min_score=min_score,
                    max_results=max_results,
                    require_uptrend=require_uptrend,
                    require_hot_sector=require_hot_sector,
                    require_breakout=require_breakout,
                    strategy_id=strategy_id,
                    progress_callback=progress_callback,
                )

                run_id = uuid.uuid4().hex
                selection_date = datetime.now().strftime("%Y-%m-%d")

                try:
                    db_path = await _get_db_path()
                    async with aiosqlite.connect(db_path) as db:
                        await db.execute("PRAGMA journal_mode=WAL;")

                        for item in results:
                            stock_code = item.get("stock_code") or item.get("raw_code") or ""
                            stock_name = item.get("stock_name") or item.get("name") or ""
                            composite_score = float(item.get("composite_score") or 0)
                            selection_reason = item.get("selection_reason") or ""

                            risk_level = item.get("risk_level")
                            holding_period = item.get("holding_period")
                            target_price = item.get("target_price")
                            stop_loss_price = item.get("stop_loss_price")

                            parts = []
                            if risk_level:
                                parts.append(f"风险等级: {risk_level}")
                            if holding_period:
                                parts.append(f"持有周期: {holding_period}")
                            if target_price is not None:
                                parts.append(f"目标价: {target_price:.2f}")
                            if stop_loss_price is not None:
                                parts.append(f"止损价: {stop_loss_price:.2f}")
                            risk_advice = "；".join(parts) if parts else None

                            await db.execute(
                                """
                                INSERT INTO advanced_selection_history (
                                    run_id,
                                    strategy_id,
                                    strategy_name,
                                    stock_code,
                                    stock_name,
                                    composite_score,
                                    selection_date,
                                    risk_advice,
                                    selection_reason
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    run_id,
                                    strategy_id,
                                    strategy_name,
                                    stock_code,
                                    stock_name,
                                    composite_score,
                                    selection_date,
                                    risk_advice,
                                    selection_reason,
                                ),
                            )

                        await db.commit()
                        logger.info(
                            f"已保存后台任务高级选股历史记录，job_id={job_id}，run_id={run_id}，数量={len(results)}"
                        )
                except Exception as e:
                    logger.error(f"保存后台任务高级选股历史记录失败: {e}")

                job = advanced_selection_jobs.get(job_id)
                if job is None:
                    return
                job["status"] = "completed"
                job["progress"] = 1.0
                job["results"] = results
                job["result_count"] = len(results)
                job["updated_at"] = datetime.now().isoformat()
            except Exception as exc:
                job = advanced_selection_jobs.get(job_id)
                if job is not None:
                    job["status"] = "failed"
                    job["error"] = str(exc)
                    job["updated_at"] = datetime.now().isoformat()
                logger.error(f"后台运行高级选股任务失败: {exc}")

        asyncio.create_task(job_runner())

        return {
            "job_id": job_id,
            "status": "pending",
            "created_at": created_at,
        }
    except Exception as e:
        logger.error(f"创建高级选股后台任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建后台任务失败: {str(e)}")


@router.get("/jobs/{job_id}")
async def get_advanced_selection_job(job_id: str):
    job = advanced_selection_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="未找到对应的选股任务")

    status = job.get("status")
    base = {
        "job_id": job_id,
        "status": status,
        "progress": job.get("progress", 0.0),
        "processed": job.get("processed", 0),
        "total": job.get("total", 0),
        "selected": job.get("selected", 0),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
        "parameters": job.get("parameters"),
        "error": job.get("error"),
    }

    if status == "completed":
        base["result_count"] = job.get("result_count", 0)
        base["results"] = job.get("results") or []

    return base


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

        results = await advanced_selection_analyzer.run_advanced_selection(
            min_score=strategy['min_score'],
            max_results=strategy['max_results'],
            require_uptrend=strategy['require_uptrend'],
            require_hot_sector=strategy['require_hot_sector'],
            require_breakout=strategy.get('require_breakout', False),
            strategy_id=strategy['id'],
            progress_callback=None,
        )

        run_id = uuid.uuid4().hex
        selection_date = datetime.now().strftime("%Y-%m-%d")

        try:
            db_path = await _get_db_path()
            async with aiosqlite.connect(db_path) as db:
                await db.execute("PRAGMA journal_mode=WAL;")

                for item in results:
                    stock_code = item.get("stock_code") or item.get("raw_code") or ""
                    stock_name = item.get("stock_name") or item.get("name") or ""
                    composite_score = float(item.get("composite_score") or 0)
                    selection_reason = item.get("selection_reason") or ""

                    risk_level = item.get("risk_level")
                    holding_period = item.get("holding_period")
                    target_price = item.get("target_price")
                    stop_loss_price = item.get("stop_loss_price")

                    parts = []
                    if risk_level:
                        parts.append(f"风险等级: {risk_level}")
                    if holding_period:
                        parts.append(f"持有周期: {holding_period}")
                    if target_price is not None:
                        parts.append(f"目标价: {target_price:.2f}")
                    if stop_loss_price is not None:
                        parts.append(f"止损价: {stop_loss_price:.2f}")
                    risk_advice = "；".join(parts) if parts else None

                    await db.execute(
                        """
                        INSERT INTO advanced_selection_history (
                            run_id,
                            strategy_id,
                            strategy_name,
                            stock_code,
                            stock_name,
                            composite_score,
                            selection_date,
                            risk_advice,
                            selection_reason
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run_id,
                            strategy["id"],
                            strategy["strategy_name"],
                            stock_code,
                            stock_name,
                            composite_score,
                            selection_date,
                            risk_advice,
                            selection_reason,
                        ),
                    )

                await db.commit()
                logger.info(f"已保存按策略运行的高级选股历史记录，run_id={run_id}，数量={len(results)}")
        except Exception as e:
            logger.error(f"保存按策略运行的高级选股历史记录失败: {e}")

        return {
            "strategy": strategy,
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat(),
            "run_id": run_id
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

        try:
            from ..utils.database import get_database
        except ImportError:
            from utils.database import get_database

        advanced_results: list[dict[str, Any]] = []
        async with get_database() as db:
            cursor = await db.execute(
                """
                SELECT stock_code, stock_name, composite_score, selection_reason, selection_date
                FROM advanced_selection_history
                WHERE composite_score >= ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (min_score, max_results),
            )
            rows = await cursor.fetchall()
            for row in rows:
                advanced_results.append(
                    {
                        "stock_code": row["stock_code"],
                        "stock_name": row["stock_name"],
                        "composite_score": float(row["composite_score"] or 0),
                        "selection_reason": row["selection_reason"] or "",
                        "analysis_date": row["selection_date"] or "",
                    }
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

        try:
            from ..utils.database import get_database
        except ImportError:
            from utils.database import get_database

        strategy_stats_map: dict[tuple[int, str], dict[str, Any]] = {}
        async with get_database() as db:
            cursor = await db.execute(
                """
                SELECT strategy_id, COALESCE(strategy_name, '') AS strategy_name,
                       COUNT(*) AS sample_count,
                       AVG(composite_score) AS avg_composite_score
                FROM advanced_selection_history
                WHERE strategy_id IS NOT NULL
                  AND created_at >= datetime('now', '-7 days')
                GROUP BY strategy_id, strategy_name
                ORDER BY sample_count DESC
                """
            )
            rows = await cursor.fetchall()
            for row in rows:
                key = (int(row["strategy_id"]), str(row["strategy_name"] or ""))
                strategy_stats_map[key] = {
                    "strategy_id": key[0],
                    "strategy_name": key[1] or str(key[0]),
                    "sample_count": int(row["sample_count"] or 0),
                    "avg_composite_score": round(float(row["avg_composite_score"] or 0), 1),
                    "avg_momentum_score": 0.0,
                    "avg_sector_score": 0.0,
                }

        strategy_stats = list(strategy_stats_map.values())

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


@router.get("/history")
async def get_advanced_selection_history(
    limit: int = Query(100, ge=1, le=500, description="返回记录条数"),
    days: Optional[int] = Query(None, ge=1, le=365, description="最近多少天的历史记录"),
    strategy_id: Optional[int] = Query(None, description="按策略ID筛选"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
):
    """
    获取高级选股历史记录

    包含选股策略、股票名称、股票代码、综合评分、选股日期、风险建议、入选理由
    """
    try:
        db_path = await _get_db_path()
        async with aiosqlite.connect(db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL;")

            where_sql = " FROM advanced_selection_history WHERE 1=1"
            params: list[Any] = []

            if strategy_id is not None:
                where_sql += " AND strategy_id = ?"
                params.append(strategy_id)

            if start_date is not None:
                where_sql += " AND selection_date >= ?"
                params.append(start_date)

            if end_date is not None:
                where_sql += " AND selection_date <= ?"
                params.append(end_date)

            if days is not None:
                where_sql += " AND created_at >= datetime('now', ?)"
                params.append(f'-{days} days')

            count_sql = "SELECT COUNT(*)" + where_sql
            count_cursor = await db.execute(count_sql, params)
            count_row = await count_cursor.fetchone()
            total_count = int(count_row[0]) if count_row and count_row[0] is not None else 0

            data_sql = """
                SELECT
                    run_id,
                    strategy_id,
                    strategy_name,
                    stock_code,
                    stock_name,
                    composite_score,
                    selection_date,
                    risk_advice,
                    selection_reason,
                    created_at
            """ + where_sql + " ORDER BY created_at DESC LIMIT ?"

            data_params = list(params)
            data_params.append(limit)

            cursor = await db.execute(data_sql, data_params)
            rows = await cursor.fetchall()

            history = []
            for row in rows:
                history.append({
                    "run_id": row[0],
                    "strategy_id": row[1],
                    "strategy_name": row[2],
                    "stock_code": row[3],
                    "stock_name": row[4],
                    "composite_score": row[5],
                    "selection_date": row[6],
                    "risk_advice": row[7],
                    "selection_reason": row[8],
                    "created_at": row[9],
                })

            return {
                "count": total_count,
                "results": history,
                "timestamp": datetime.now().isoformat()
            }

    except Exception as e:
        logger.error(f"获取高级选股历史记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取历史记录失败: {str(e)}")


@router.delete("/history/item")
async def delete_advanced_selection_history_item(
    run_id: str = Query(..., description="选股批次ID"),
    stock_code: str = Query(..., description="股票代码"),
    selection_date: str = Query(..., description="选股日期（YYYY-MM-DD）"),
):
    try:
        db_path = await _get_db_path()
        async with aiosqlite.connect(db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL;")

            cursor = await db.execute(
                """
                DELETE FROM advanced_selection_history
                WHERE run_id = ? AND stock_code = ? AND selection_date = ?
                """,
                (run_id, stock_code, selection_date),
            )
            await db.commit()

            deleted_count = cursor.rowcount if cursor.rowcount is not None else 0

            if deleted_count == 0:
                raise HTTPException(status_code=404, detail="未找到匹配的历史记录")

            return {
                "deleted": deleted_count,
                "run_id": run_id,
                "stock_code": stock_code,
                "selection_date": selection_date,
                "timestamp": datetime.now().isoformat(),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除高级选股历史记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除历史记录失败: {str(e)}")


@router.delete("/history/batch")
async def delete_advanced_selection_history_batch(
    items: List[Dict[str, str]],
):
    try:
        if not items:
            raise HTTPException(status_code=400, detail="请求列表不能为空")

        db_path = await _get_db_path()
        async with aiosqlite.connect(db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL;")

            deleted_total = 0
            for item in items:
                run_id = item.get("run_id")
                stock_code = item.get("stock_code")
                selection_date = item.get("selection_date")

                if not run_id or not stock_code or not selection_date:
                    continue

                cursor = await db.execute(
                    """
                    DELETE FROM advanced_selection_history
                    WHERE run_id = ? AND stock_code = ? AND selection_date = ?
                    """,
                    (run_id, stock_code, selection_date),
                )
                deleted = cursor.rowcount if cursor.rowcount is not None else 0
                deleted_total += deleted

            await db.commit()

            return {
                "requested": len(items),
                "deleted": deleted_total,
                "timestamp": datetime.now().isoformat(),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量删除高级选股历史记录失败: {e}")
        raise HTTPException(status_code=500, detail=f"批量删除历史记录失败: {str(e)}")
