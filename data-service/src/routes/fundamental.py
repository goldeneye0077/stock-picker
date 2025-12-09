"""
基本面数据API路由
提供基本面数据采集、分析和查询的API接口
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import logging

try:
    # 首先尝试相对导入
    from ..analyzers.fundamental.fundamental_client import FundamentalClient
    from ..analyzers.fundamental.fundamental_analyzer import FundamentalAnalyzer
    from ..data_sources.tushare_client import TushareClient
    from ..utils.fundamental_db import FundamentalDB
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from analyzers.fundamental.fundamental_client import FundamentalClient
    from analyzers.fundamental.fundamental_analyzer import FundamentalAnalyzer
    from data_sources.tushare_client import TushareClient
    from utils.fundamental_db import FundamentalDB

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["fundamental"])


# 依赖注入
def get_tushare_client():
    """获取Tushare客户端"""
    return TushareClient()


def get_fundamental_client(tushare_client: TushareClient = Depends(get_tushare_client)):
    """获取基本面客户端"""
    return FundamentalClient(tushare_client)


def get_fundamental_analyzer(fundamental_client: FundamentalClient = Depends(get_fundamental_client)):
    """获取基本面分析器"""
    return FundamentalAnalyzer(fundamental_client)


def get_fundamental_db():
    """获取基本面数据库"""
    return FundamentalDB()


@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "service": "fundamental", "timestamp": datetime.now().isoformat()}


@router.get("/stock/{stock_code}/basic")
async def get_stock_basic_info(
    stock_code: str,
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取股票基本信息

    Args:
        stock_code: 股票代码

    Returns:
        股票基本信息
    """
    try:
        basic_info = await fundamental_client.fetch_stock_basic_info(stock_code)
        if not basic_info:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的基本信息")

        return {
            "stock_code": stock_code,
            "data": basic_info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 基本信息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取股票基本信息失败: {str(e)}")


@router.get("/stock/{stock_code}/financial-indicators")
async def get_financial_indicators(
    stock_code: str,
    period: Optional[str] = Query(None, description="报告期，格式如20241231"),
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取财务指标数据

    Args:
        stock_code: 股票代码
        period: 报告期

    Returns:
        财务指标数据
    """
    try:
        indicators = await fundamental_client.fetch_financial_indicators(stock_code, period)
        if not indicators:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的财务指标数据")

        return {
            "stock_code": stock_code,
            "period": period or "最新",
            "data": indicators,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 财务指标失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取财务指标失败: {str(e)}")


@router.get("/stock/{stock_code}/financial-statements")
async def get_financial_statements(
    stock_code: str,
    period: Optional[str] = Query(None, description="报告期，格式如20241231"),
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取财务报表数据

    Args:
        stock_code: 股票代码
        period: 报告期

    Returns:
        财务报表数据
    """
    try:
        # 获取利润表
        income_statement = await fundamental_client.fetch_income_statement(stock_code, period)

        # 获取资产负债表
        balance_sheet = await fundamental_client.fetch_balance_sheet(stock_code, period)

        # 获取现金流量表
        cash_flow = await fundamental_client.fetch_cash_flow(stock_code, period)

        result = {
            "stock_code": stock_code,
            "period": period or "最新",
            "income_statement": income_statement,
            "balance_sheet": balance_sheet,
            "cash_flow": cash_flow,
            "timestamp": datetime.now().isoformat()
        }

        # 检查是否有数据
        if not any([income_statement, balance_sheet, cash_flow]):
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的财务报表数据")

        return result
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 财务报表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取财务报表失败: {str(e)}")


@router.get("/stock/{stock_code}/dividend")
async def get_dividend_data(
    stock_code: str,
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取分红数据

    Args:
        stock_code: 股票代码

    Returns:
        分红数据
    """
    try:
        dividend_data = await fundamental_client.fetch_dividend_data(stock_code)

        # 如果没有分红数据，返回空数组而不是抛出404
        if not dividend_data:
            return {
                "stock_code": stock_code,
                "data": [],
                "count": 0,
                "message": "该股票暂无分红数据",
                "timestamp": datetime.now().isoformat()
            }

        return {
            "stock_code": stock_code,
            "data": dividend_data,
            "count": len(dividend_data),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 分红数据失败: {e}")
        # 返回空数据而不是抛出500错误
        return {
            "stock_code": stock_code,
            "data": [],
            "count": 0,
            "message": f"获取分红数据失败: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }


@router.get("/stock/{stock_code}/shareholders")
async def get_shareholder_data(
    stock_code: str,
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取股东数据

    Args:
        stock_code: 股票代码

    Returns:
        股东数据
    """
    try:
        shareholder_data = await fundamental_client.fetch_shareholder_data(stock_code)
        if not shareholder_data:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的股东数据")

        return {
            "stock_code": stock_code,
            "data": shareholder_data,
            "count": len(shareholder_data),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 股东数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取股东数据失败: {str(e)}")


@router.get("/stock/{stock_code}/valuation")
async def get_valuation_data(
    stock_code: str,
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取估值数据

    Args:
        stock_code: 股票代码

    Returns:
        估值数据
    """
    try:
        valuation_data = await fundamental_client.fetch_valuation_data(stock_code)
        if not valuation_data:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的估值数据")

        return {
            "stock_code": stock_code,
            "data": valuation_data,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 估值数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取估值数据失败: {str(e)}")


@router.get("/stock/{stock_code}/comprehensive")
async def get_comprehensive_fundamental_data(
    stock_code: str,
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取综合基本面数据

    Args:
        stock_code: 股票代码

    Returns:
        综合基本面数据
    """
    try:
        data = await fundamental_client.fetch_comprehensive_fundamental_data(stock_code)

        return {
            "stock_code": stock_code,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 综合基本面数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取综合基本面数据失败: {str(e)}")


@router.post("/stock/{stock_code}/fetch-and-save")
async def fetch_and_save_fundamental_data(
    stock_code: str,
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    获取并保存基本面数据

    Args:
        stock_code: 股票代码

    Returns:
        处理结果
    """
    try:
        data = await fundamental_client.fetch_and_save_fundamental_data(stock_code)

        return {
            "stock_code": stock_code,
            "data": data,
            "save_status": data.get("save_status", "unknown"),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        logger.error(f"获取并保存股票 {stock_code} 基本面数据失败: {error_detail}")
        
        # Write to error log file
        try:
            with open("error.log", "a", encoding="utf-8") as f:
                f.write(f"{datetime.now().isoformat()} - Error processing {stock_code}:\n{error_detail}\n\n")
        except:
            pass
            
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/batch/fetch-and-save")
async def batch_fetch_and_save_fundamental_data(
    stock_codes: List[str],
    fundamental_client: FundamentalClient = Depends(get_fundamental_client)
):
    """
    批量获取并保存基本面数据

    Args:
        stock_codes: 股票代码列表

    Returns:
        批量处理结果
    """
    try:
        if len(stock_codes) > 100:
            raise HTTPException(status_code=400, detail="单次处理股票数量不能超过100只")

        results = await fundamental_client.batch_fetch_and_save_fundamental_data(stock_codes)

        success_count = len([v for v in results.values() if v.get('save_status') == 'success'])
        failed_count = len(stock_codes) - success_count

        return {
            "total": len(stock_codes),
            "success": success_count,
            "failed": failed_count,
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"批量获取并保存基本面数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"批量处理失败: {str(e)}")


@router.get("/stock/{stock_code}/analysis")
async def analyze_stock_fundamentals(
    stock_code: str,
    fundamental_analyzer: FundamentalAnalyzer = Depends(get_fundamental_analyzer)
):
    """
    分析股票基本面

    Args:
        stock_code: 股票代码

    Returns:
        基本面分析结果
    """
    try:
        analysis_result = await fundamental_analyzer.analyze_stock_fundamentals(stock_code)

        if "error" in analysis_result:
            raise HTTPException(status_code=500, detail=analysis_result["error"])

        # analysis_result 已经是前端兼容的格式，直接返回
        return analysis_result
    except Exception as e:
        logger.error(f"分析股票 {stock_code} 基本面失败: {e}")
        raise HTTPException(status_code=500, detail=f"基本面分析失败: {str(e)}")


@router.post("/batch/analyze")
async def batch_analyze_stocks(
    stock_codes: List[str],
    fundamental_analyzer: FundamentalAnalyzer = Depends(get_fundamental_analyzer)
):
    """
    批量分析股票基本面

    Args:
        stock_codes: 股票代码列表

    Returns:
        批量分析结果
    """
    try:
        if len(stock_codes) > 50:
            raise HTTPException(status_code=400, detail="单次分析股票数量不能超过50只")

        results = await fundamental_analyzer.analyze_multiple_stocks(stock_codes)

        success_count = len([v for v in results.values() if 'error' not in v])
        failed_count = len(stock_codes) - success_count

        return {
            "total": len(stock_codes),
            "success": success_count,
            "failed": failed_count,
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"批量分析股票基本面失败: {e}")
        raise HTTPException(status_code=500, detail=f"批量分析失败: {str(e)}")


@router.get("/top-stocks")
async def get_top_fundamental_stocks(
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    min_score: float = Query(70.0, ge=0, le=100, description="最低评分"),
    fundamental_analyzer: FundamentalAnalyzer = Depends(get_fundamental_analyzer)
):
    """
    获取基本面评分最高的股票

    Args:
        limit: 返回数量
        min_score: 最低评分

    Returns:
        高分股票列表
    """
    try:
        top_stocks = await fundamental_analyzer.get_top_fundamental_stocks(limit, min_score)

        return {
            "limit": limit,
            "min_score": min_score,
            "count": len(top_stocks),
            "stocks": top_stocks,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取高分股票失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取高分股票失败: {str(e)}")


@router.post("/compare")
async def compare_stocks(
    stock_codes: List[str],
    fundamental_analyzer: FundamentalAnalyzer = Depends(get_fundamental_analyzer)
):
    """
    比较多只股票的基本面

    Args:
        stock_codes: 股票代码列表

    Returns:
        比较结果
    """
    try:
        if len(stock_codes) < 2:
            raise HTTPException(status_code=400, detail="至少需要2只股票进行比较")
        if len(stock_codes) > 10:
            raise HTTPException(status_code=400, detail="单次比较股票数量不能超过10只")

        comparison_result = await fundamental_analyzer.compare_stocks(stock_codes)

        if "error" in comparison_result:
            raise HTTPException(status_code=500, detail=comparison_result["error"])

        return {
            "compared_stocks": stock_codes,
            "comparison": comparison_result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"比较股票基本面失败: {e}")
        raise HTTPException(status_code=500, detail=f"比较失败: {str(e)}")


@router.get("/stock/{stock_code}/scores")
async def get_fundamental_scores(
    stock_code: str,
    limit: int = Query(10, ge=1, le=100, description="返回数量"),
    fundamental_db: FundamentalDB = Depends(get_fundamental_db)
):
    """
    获取股票基本面评分历史

    Args:
        stock_code: 股票代码
        limit: 返回数量

    Returns:
        评分历史
    """
    try:
        # 从数据库获取评分历史
        scores = await fundamental_db.get_financial_indicators_history(stock_code, limit)

        if not scores:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的评分历史")

        return {
            "stock_code": stock_code,
            "count": len(scores),
            "scores": scores,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 评分历史失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取评分历史失败: {str(e)}")


@router.get("/stock/{stock_code}/latest-financials")
async def get_latest_financial_statements(
    stock_code: str,
    fundamental_db: FundamentalDB = Depends(get_fundamental_db)
):
    """
    获取最新财务报表数据

    Args:
        stock_code: 股票代码

    Returns:
        最新财务报表
    """
    try:
        financials = await fundamental_db.get_latest_financial_statements(stock_code)

        if not financials:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的财务报表数据")

        return {
            "stock_code": stock_code,
            "financials": financials,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 最新财务报表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取最新财务报表失败: {str(e)}")


@router.get("/stock/{stock_code}/dividend-history")
async def get_dividend_history(
    stock_code: str,
    limit: int = Query(10, ge=1, le=50, description="返回数量"),
    fundamental_db: FundamentalDB = Depends(get_fundamental_db)
):
    """
    获取分红历史数据

    Args:
        stock_code: 股票代码
        limit: 返回数量

    Returns:
        分红历史
    """
    try:
        dividend_history = await fundamental_db.get_dividend_history(stock_code, limit)

        if not dividend_history:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的分红历史")

        return {
            "stock_code": stock_code,
            "count": len(dividend_history),
            "dividend_history": dividend_history,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 分红历史失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取分红历史失败: {str(e)}")


@router.get("/stock/{stock_code}/top-shareholders")
async def get_top_shareholders(
    stock_code: str,
    limit: int = Query(10, ge=1, le=20, description="返回数量"),
    fundamental_db: FundamentalDB = Depends(get_fundamental_db)
):
    """
    获取前十大股东

    Args:
        stock_code: 股票代码
        limit: 返回数量

    Returns:
        前十大股东
    """
    try:
        top_shareholders = await fundamental_db.get_top_shareholders(stock_code, limit)

        if not top_shareholders:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的股东数据")

        return {
            "stock_code": stock_code,
            "count": len(top_shareholders),
            "top_shareholders": top_shareholders,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 前十大股东失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取前十大股东失败: {str(e)}")


@router.get("/stock/{stock_code}/extended-info")
async def get_stock_extended_info(
    stock_code: str,
    fundamental_db: FundamentalDB = Depends(get_fundamental_db)
):
    """
    获取股票扩展信息

    Args:
        stock_code: 股票代码

    Returns:
        股票扩展信息
    """
    try:
        extended_info = await fundamental_db.get_stock_basic_extended(stock_code)

        if not extended_info:
            raise HTTPException(status_code=404, detail=f"未找到股票 {stock_code} 的扩展信息")

        return {
            "stock_code": stock_code,
            "extended_info": extended_info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取股票 {stock_code} 扩展信息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取扩展信息失败: {str(e)}")


@router.get("/industry/{industry}/stocks")
async def get_industry_stocks(
    industry: str,
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    min_score: float = Query(60.0, ge=0, le=100, description="最低评分"),
    fundamental_db: FundamentalDB = Depends(get_fundamental_db)
):
    """
    获取行业内的股票

    Args:
        industry: 行业名称
        limit: 返回数量
        min_score: 最低评分

    Returns:
        行业股票列表
    """
    try:
        # 这里需要实现行业股票查询逻辑
        # 暂时返回空结果，后续可以扩展
        return {
            "industry": industry,
            "limit": limit,
            "min_score": min_score,
            "stocks": [],
            "message": "行业股票查询功能待实现",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"获取行业 {industry} 股票失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取行业股票失败: {str(e)}") 
