"""
网站统计 API 路由
提供页面访问统计、API 调用统计等功能
"""

from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from loguru import logger

try:
    from ..utils.database import get_database
    from ..utils.auth import get_current_user, get_admin_user, get_optional_user
except ImportError:
    from utils.database import get_database
    from utils.auth import get_current_user, get_admin_user, get_optional_user

router = APIRouter()


# ==================== 请求/响应模型 ====================

class PageViewRequest(BaseModel):
    page_path: str
    referrer: Optional[str] = None


class PageViewResponse(BaseModel):
    success: bool
    message: str


class SummaryResponse(BaseModel):
    today_uv: int
    today_pv: int
    today_api_calls: int
    avg_response_time_ms: float
    week_uv: int
    week_pv: int
    month_uv: int
    month_pv: int


class PageRankingItem(BaseModel):
    page_path: str
    view_count: int
    unique_visitors: int


class ApiStatsItem(BaseModel):
    endpoint: str
    call_count: int
    avg_response_time_ms: float
    error_rate: float


class TimeDistributionItem(BaseModel):
    hour: int
    count: int


class UserActivityItem(BaseModel):
    user_id: int
    username: str
    page_views: int
    api_calls: int
    last_active: str


class RealtimeItem(BaseModel):
    id: int
    page_path: str
    user_id: Optional[int]
    username: Optional[str]
    ip_address: Optional[str]
    created_at: str


# ==================== API 端点 ====================

@router.post("/page-view", response_model=PageViewResponse)
async def record_page_view(
    request: Request,
    body: PageViewRequest,
    current_user: Optional[dict] = None
):
    """
    记录页面访问 (前端调用)
    无需登录即可调用，但会记录登录用户信息
    """
    try:
        # 尝试获取当前用户（可选）
        user_id = None
        try:
            from .auth import get_optional_user
            user = await get_optional_user(request)
            if user:
                user_id = user.get("id")
        except Exception:
            pass

        # 获取客户端信息
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "")[:500]  # 限制长度
        
        # 使用 cookie 或生成 session_id
        session_id = request.cookies.get("sq_session_id") or request.headers.get("x-session-id")

        async with get_database() as db:
            await db.execute(
                """
                INSERT INTO page_views (page_path, user_id, session_id, ip_address, user_agent, referrer)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (body.page_path, user_id, session_id, client_ip, user_agent, body.referrer)
            )
            await db.commit()

        return PageViewResponse(success=True, message="Page view recorded")
    except Exception as e:
        logger.error(f"Failed to record page view: {e}")
        return PageViewResponse(success=False, message=str(e))


@router.get("/summary", response_model=SummaryResponse)
async def get_analytics_summary(admin: dict = Depends(get_admin_user)):
    """
    获取统计总览数据 (仅管理员)
    """
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    async with get_database() as db:
        # 今日 UV (按 session_id 或 user_id 或 ip 去重)
        cursor = await db.execute(
            """
            SELECT COUNT(DISTINCT COALESCE(session_id, ip_address, 'unknown')) as uv
            FROM page_views WHERE created_at >= ?
            """,
            (today_start.isoformat(),)
        )
        row = await cursor.fetchone()
        today_uv = row["uv"] if row else 0

        # 今日 PV
        cursor = await db.execute(
            "SELECT COUNT(*) as pv FROM page_views WHERE created_at >= ?",
            (today_start.isoformat(),)
        )
        row = await cursor.fetchone()
        today_pv = row["pv"] if row else 0

        # 今日 API 调用量
        cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM api_calls WHERE created_at >= ?",
            (today_start.isoformat(),)
        )
        row = await cursor.fetchone()
        today_api_calls = row["cnt"] if row else 0

        # 平均响应时间
        cursor = await db.execute(
            "SELECT AVG(response_time_ms) as avg_time FROM api_calls WHERE created_at >= ?",
            (today_start.isoformat(),)
        )
        row = await cursor.fetchone()
        avg_response_time_ms = float(row["avg_time"] or 0) if row else 0.0

        # 本周 UV/PV
        cursor = await db.execute(
            """
            SELECT 
                COUNT(DISTINCT COALESCE(session_id, ip_address, 'unknown')) as uv,
                COUNT(*) as pv
            FROM page_views WHERE created_at >= ?
            """,
            (week_start.isoformat(),)
        )
        row = await cursor.fetchone()
        week_uv = row["uv"] if row else 0
        week_pv = row["pv"] if row else 0

        # 本月 UV/PV
        cursor = await db.execute(
            """
            SELECT 
                COUNT(DISTINCT COALESCE(session_id, ip_address, 'unknown')) as uv,
                COUNT(*) as pv
            FROM page_views WHERE created_at >= ?
            """,
            (month_start.isoformat(),)
        )
        row = await cursor.fetchone()
        month_uv = row["uv"] if row else 0
        month_pv = row["pv"] if row else 0

    return SummaryResponse(
        today_uv=today_uv,
        today_pv=today_pv,
        today_api_calls=today_api_calls,
        avg_response_time_ms=round(avg_response_time_ms, 2),
        week_uv=week_uv,
        week_pv=week_pv,
        month_uv=month_uv,
        month_pv=month_pv
    )


@router.get("/page-ranking", response_model=List[PageRankingItem])
async def get_page_ranking(
    days: int = 7,
    limit: int = 10,
    admin: dict = Depends(get_admin_user)
):
    """
    获取页面热度排行 (仅管理员)
    """
    since = (datetime.now() - timedelta(days=days)).isoformat()

    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 
                page_path,
                COUNT(*) as view_count,
                COUNT(DISTINCT COALESCE(session_id, ip_address, 'unknown')) as unique_visitors
            FROM page_views
            WHERE created_at >= ?
            GROUP BY page_path
            ORDER BY view_count DESC
            LIMIT ?
            """,
            (since, limit)
        )
        rows = await cursor.fetchall()

    return [
        PageRankingItem(
            page_path=row["page_path"],
            view_count=row["view_count"],
            unique_visitors=row["unique_visitors"]
        )
        for row in rows
    ]


@router.get("/api-stats", response_model=List[ApiStatsItem])
async def get_api_stats(
    days: int = 7,
    limit: int = 20,
    admin: dict = Depends(get_admin_user)
):
    """
    获取 API 调用统计 (仅管理员)
    """
    since = (datetime.now() - timedelta(days=days)).isoformat()

    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 
                endpoint,
                COUNT(*) as call_count,
                AVG(response_time_ms) as avg_response_time_ms,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as error_rate
            FROM api_calls
            WHERE created_at >= ?
            GROUP BY endpoint
            ORDER BY call_count DESC
            LIMIT ?
            """,
            (since, limit)
        )
        rows = await cursor.fetchall()

    return [
        ApiStatsItem(
            endpoint=row["endpoint"],
            call_count=row["call_count"],
            avg_response_time_ms=round(float(row["avg_response_time_ms"] or 0), 2),
            error_rate=round(float(row["error_rate"] or 0), 2)
        )
        for row in rows
    ]


@router.get("/time-distribution", response_model=List[TimeDistributionItem])
async def get_time_distribution(
    days: int = 7,
    admin: dict = Depends(get_admin_user)
):
    """
    获取 24 小时访问时段分布 (仅管理员)
    """
    since = (datetime.now() - timedelta(days=days)).isoformat()

    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 
                CAST(strftime('%H', created_at) AS INTEGER) as hour,
                COUNT(*) as count
            FROM page_views
            WHERE created_at >= ?
            GROUP BY hour
            ORDER BY hour
            """,
            (since,)
        )
        rows = await cursor.fetchall()

    # 确保 24 小时都有数据
    hour_map = {row["hour"]: row["count"] for row in rows}
    return [
        TimeDistributionItem(hour=h, count=hour_map.get(h, 0))
        for h in range(24)
    ]


@router.get("/user-activity", response_model=List[UserActivityItem])
async def get_user_activity(
    days: int = 7,
    limit: int = 20,
    admin: dict = Depends(get_admin_user)
):
    """
    获取用户活跃排行 (仅管理员)
    """
    since = (datetime.now() - timedelta(days=days)).isoformat()

    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 
                u.id as user_id,
                u.username,
                COALESCE(pv.view_count, 0) as page_views,
                COALESCE(ac.call_count, 0) as api_calls,
                COALESCE(pv.last_active, ac.last_active) as last_active
            FROM users u
            LEFT JOIN (
                SELECT user_id, COUNT(*) as view_count, MAX(created_at) as last_active
                FROM page_views
                WHERE created_at >= ? AND user_id IS NOT NULL
                GROUP BY user_id
            ) pv ON u.id = pv.user_id
            LEFT JOIN (
                SELECT user_id, COUNT(*) as call_count, MAX(created_at) as last_active
                FROM api_calls
                WHERE created_at >= ? AND user_id IS NOT NULL
                GROUP BY user_id
            ) ac ON u.id = ac.user_id
            WHERE pv.view_count > 0 OR ac.call_count > 0
            ORDER BY (COALESCE(pv.view_count, 0) + COALESCE(ac.call_count, 0)) DESC
            LIMIT ?
            """,
            (since, since, limit)
        )
        rows = await cursor.fetchall()

    return [
        UserActivityItem(
            user_id=row["user_id"],
            username=row["username"],
            page_views=row["page_views"],
            api_calls=row["api_calls"],
            last_active=row["last_active"] or ""
        )
        for row in rows
    ]


@router.get("/realtime", response_model=List[RealtimeItem])
async def get_realtime_access(
    limit: int = 50,
    admin: dict = Depends(get_admin_user)
):
    """
    获取实时访问流 (仅管理员)
    """
    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 
                pv.id,
                pv.page_path,
                pv.user_id,
                u.username,
                pv.ip_address,
                pv.created_at
            FROM page_views pv
            LEFT JOIN users u ON pv.user_id = u.id
            ORDER BY pv.created_at DESC
            LIMIT ?
            """,
            (limit,)
        )
        rows = await cursor.fetchall()

    return [
        RealtimeItem(
            id=row["id"],
            page_path=row["page_path"],
            user_id=row["user_id"],
            username=row["username"],
            ip_address=row["ip_address"],
            created_at=row["created_at"]
        )
        for row in rows
    ]


@router.get("/trend")
async def get_trend(
    days: int = 30,
    admin: dict = Depends(get_admin_user)
):
    """
    获取 UV/PV 趋势数据 (仅管理员)
    """
    since = (datetime.now() - timedelta(days=days)).isoformat()

    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as pv,
                COUNT(DISTINCT COALESCE(session_id, ip_address, 'unknown')) as uv
            FROM page_views
            WHERE created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date
            """,
            (since,)
        )
        rows = await cursor.fetchall()

    return [
        {"date": row["date"], "pv": row["pv"], "uv": row["uv"]}
        for row in rows
    ]
