"""
基本面数据库操作工具
提供基本面数据（财务指标、财务报表、分红、股东等）的数据库操作功能
"""

import aiosqlite
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date
import pandas as pd

logger = logging.getLogger(__name__)


class FundamentalDB:
    """基本面数据库操作类"""

    def __init__(self, db_path: str = "../data/stock_picker.db"):
        self.db_path = db_path

    def get_connection(self):
        """获取数据库连接上下文管理器"""
        return aiosqlite.connect(self.db_path)

    async def save_stock_basic_extended(self, stock_code: str, data: Dict[str, Any]) -> bool:
        """保存股票基本信息扩展数据"""
        try:
            async with self.get_connection() as db:
                # 检查记录是否存在
                cursor = await db.execute(
                    "SELECT id FROM stock_basic_extended WHERE stock_code = ?",
                    (stock_code,)
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    update_fields = []
                    update_values = []
                    for key, value in data.items():
                        if key != "stock_code":
                            update_fields.append(f"{key} = ?")
                            update_values.append(value)

                    update_values.append(stock_code)
                    update_query = f"""
                        UPDATE stock_basic_extended
                        SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
                        WHERE stock_code = ?
                    """
                    await db.execute(update_query, update_values)
                else:
                    # 插入新记录
                    fields = ["stock_code"] + list(data.keys())
                    placeholders = ["?"] * len(fields)
                    values = [stock_code] + list(data.values())

                    insert_query = f"""
                        INSERT INTO stock_basic_extended ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                    """
                    await db.execute(insert_query, values)

                await db.commit()
                return True
        except Exception as e:
            logger.error(f"保存股票基本信息扩展数据失败: {e}")
            return False

    async def save_financial_indicators(self, stock_code: str, indicators: List[Dict[str, Any]]) -> int:
        """保存财务指标数据"""
        saved_count = 0
        try:
            async with self.get_connection() as db:
                for indicator in indicators:
                    try:
                        # 检查记录是否存在
                        cursor = await db.execute(
                            "SELECT id FROM financial_indicators WHERE stock_code = ? AND end_date = ?",
                            (stock_code, indicator.get("end_date"))
                        )
                        existing = await cursor.fetchone()

                        if existing:
                            # 更新现有记录
                            update_fields = []
                            update_values = []
                            for key, value in indicator.items():
                                if key not in ["stock_code", "end_date"]:
                                    update_fields.append(f"{key} = ?")
                                    update_values.append(value)

                            update_values.extend([stock_code, indicator.get("end_date")])
                            update_query = f"""
                                UPDATE financial_indicators
                                SET {', '.join(update_fields)}
                                WHERE stock_code = ? AND end_date = ?
                            """
                            await db.execute(update_query, update_values)
                        else:
                            # 插入新记录
                            fields = ["stock_code"] + list(indicator.keys())
                            placeholders = ["?"] * len(fields)
                            values = [stock_code] + list(indicator.values())

                            insert_query = f"""
                                INSERT INTO financial_indicators ({', '.join(fields)})
                                VALUES ({', '.join(placeholders)})
                            """
                            await db.execute(insert_query, values)

                        saved_count += 1
                    except Exception as e:
                        logger.warning(f"保存财务指标数据失败 (股票: {stock_code}, 日期: {indicator.get('end_date')}): {e}")
                        continue

                await db.commit()
        except Exception as e:
            logger.error(f"批量保存财务指标数据失败: {e}")

        return saved_count

    async def save_income_statement(self, stock_code: str, statement: Dict[str, Any]) -> bool:
        """保存利润表数据"""
        try:
            async with self.get_connection() as db:
                # 检查记录是否存在
                cursor = await db.execute(
                    """SELECT id FROM income_statements
                       WHERE stock_code = ? AND f_end_date = ? AND report_type = ?""",
                    (stock_code, statement.get("f_end_date"), statement.get("report_type", "1"))
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    update_fields = []
                    update_values = []
                    for key, value in statement.items():
                        if key not in ["stock_code", "f_end_date", "report_type"]:
                            update_fields.append(f"{key} = ?")
                            update_values.append(value)

                    update_values.extend([stock_code, statement.get("f_end_date"), statement.get("report_type", "1")])
                    update_query = f"""
                        UPDATE income_statements
                        SET {', '.join(update_fields)}
                        WHERE stock_code = ? AND f_end_date = ? AND report_type = ?
                    """
                    await db.execute(update_query, update_values)
                else:
                    # 插入新记录
                    fields = ["stock_code"] + list(statement.keys())
                    placeholders = ["?"] * len(fields)
                    values = [stock_code] + list(statement.values())

                    insert_query = f"""
                        INSERT INTO income_statements ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                    """
                    await db.execute(insert_query, values)

                await db.commit()
                return True
        except Exception as e:
            logger.error(f"保存利润表数据失败: {e}")
            return False

    async def save_balance_sheet(self, stock_code: str, balance_sheet: Dict[str, Any]) -> bool:
        """保存资产负债表数据"""
        try:
            async with self.get_connection() as db:
                # 检查记录是否存在
                cursor = await db.execute(
                    """SELECT id FROM balance_sheets
                       WHERE stock_code = ? AND f_end_date = ? AND report_type = ?""",
                    (stock_code, balance_sheet.get("f_end_date"), balance_sheet.get("report_type", "1"))
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    update_fields = []
                    update_values = []
                    for key, value in balance_sheet.items():
                        if key not in ["stock_code", "f_end_date", "report_type"]:
                            update_fields.append(f"{key} = ?")
                            update_values.append(value)

                    update_values.extend([stock_code, balance_sheet.get("f_end_date"), balance_sheet.get("report_type", "1")])
                    update_query = f"""
                        UPDATE balance_sheets
                        SET {', '.join(update_fields)}
                        WHERE stock_code = ? AND f_end_date = ? AND report_type = ?
                    """
                    await db.execute(update_query, update_values)
                else:
                    # 插入新记录
                    fields = ["stock_code"] + list(balance_sheet.keys())
                    placeholders = ["?"] * len(fields)
                    values = [stock_code] + list(balance_sheet.values())

                    insert_query = f"""
                        INSERT INTO balance_sheets ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                    """
                    await db.execute(insert_query, values)

                await db.commit()
                return True
        except Exception as e:
            logger.error(f"保存资产负债表数据失败: {e}")
            return False

    async def save_cash_flow_statement(self, stock_code: str, cash_flow: Dict[str, Any]) -> bool:
        """保存现金流量表数据"""
        try:
            async with self.get_connection() as db:
                # 检查记录是否存在
                cursor = await db.execute(
                    """SELECT id FROM cash_flow_statements
                       WHERE stock_code = ? AND f_end_date = ? AND report_type = ?""",
                    (stock_code, cash_flow.get("f_end_date"), cash_flow.get("report_type", "1"))
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    update_fields = []
                    update_values = []
                    for key, value in cash_flow.items():
                        if key not in ["stock_code", "f_end_date", "report_type"]:
                            update_fields.append(f"{key} = ?")
                            update_values.append(value)

                    update_values.extend([stock_code, cash_flow.get("f_end_date"), cash_flow.get("report_type", "1")])
                    update_query = f"""
                        UPDATE cash_flow_statements
                        SET {', '.join(update_fields)}
                        WHERE stock_code = ? AND f_end_date = ? AND report_type = ?
                    """
                    await db.execute(update_query, update_values)
                else:
                    # 插入新记录
                    fields = ["stock_code"] + list(cash_flow.keys())
                    placeholders = ["?"] * len(fields)
                    values = [stock_code] + list(cash_flow.values())

                    insert_query = f"""
                        INSERT INTO cash_flow_statements ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                    """
                    await db.execute(insert_query, values)

                await db.commit()
                return True
        except Exception as e:
            logger.error(f"保存现金流量表数据失败: {e}")
            return False

    async def save_dividend_data(self, stock_code: str, dividend: Dict[str, Any]) -> bool:
        """保存分红数据"""
        try:
            async with self.get_connection() as db:
                # 检查记录是否存在
                cursor = await db.execute(
                    "SELECT id FROM dividend_data WHERE stock_code = ? AND end_date = ?",
                    (stock_code, dividend.get("end_date"))
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    update_fields = []
                    update_values = []
                    for key, value in dividend.items():
                        if key not in ["stock_code", "end_date"]:
                            update_fields.append(f"{key} = ?")
                            update_values.append(value)

                    update_values.extend([stock_code, dividend.get("end_date")])
                    update_query = f"""
                        UPDATE dividend_data
                        SET {', '.join(update_fields)}
                        WHERE stock_code = ? AND end_date = ?
                    """
                    await db.execute(update_query, update_values)
                else:
                    # 插入新记录
                    fields = ["stock_code"] + list(dividend.keys())
                    placeholders = ["?"] * len(fields)
                    values = [stock_code] + list(dividend.values())

                    insert_query = f"""
                        INSERT INTO dividend_data ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                    """
                    await db.execute(insert_query, values)

                await db.commit()
                return True
        except Exception as e:
            logger.error(f"保存分红数据失败: {e}")
            return False

    async def save_shareholder_data(self, stock_code: str, shareholders: List[Dict[str, Any]]) -> int:
        """保存股东数据"""
        saved_count = 0
        try:
            async with self.get_connection() as db:
                for shareholder in shareholders:
                    try:
                        # 检查记录是否存在
                        cursor = await db.execute(
                            """SELECT id FROM shareholder_data
                               WHERE stock_code = ? AND end_date = ? AND holder_name = ?""",
                            (stock_code, shareholder.get("end_date"), shareholder.get("holder_name"))
                        )
                        existing = await cursor.fetchone()

                        if existing:
                            # 更新现有记录
                            update_fields = []
                            update_values = []
                            for key, value in shareholder.items():
                                if key not in ["stock_code", "end_date", "holder_name"]:
                                    update_fields.append(f"{key} = ?")
                                    update_values.append(value)

                            update_values.extend([
                                stock_code,
                                shareholder.get("end_date"),
                                shareholder.get("holder_name")
                            ])
                            update_query = f"""
                                UPDATE shareholder_data
                                SET {', '.join(update_fields)}
                                WHERE stock_code = ? AND end_date = ? AND holder_name = ?
                            """
                            await db.execute(update_query, update_values)
                        else:
                            # 插入新记录
                            fields = ["stock_code"] + list(shareholder.keys())
                            placeholders = ["?"] * len(fields)
                            values = [stock_code] + list(shareholder.values())

                            insert_query = f"""
                                INSERT INTO shareholder_data ({', '.join(fields)})
                                VALUES ({', '.join(placeholders)})
                            """
                            await db.execute(insert_query, values)

                        saved_count += 1
                    except Exception as e:
                        logger.warning(f"保存股东数据失败 (股票: {stock_code}, 股东: {shareholder.get('holder_name')}): {e}")
                        continue

                await db.commit()
        except Exception as e:
            logger.error(f"批量保存股东数据失败: {e}")

        return saved_count

    async def save_fundamental_score(self, stock_code: str, score_data: Dict[str, Any]) -> bool:
        """保存基本面综合评分"""
        try:
            async with self.get_connection() as db:
                # 检查记录是否存在
                cursor = await db.execute(
                    "SELECT id FROM fundamental_scores WHERE stock_code = ? AND score_date = ?",
                    (stock_code, score_data.get("score_date"))
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    update_fields = []
                    update_values = []
                    for key, value in score_data.items():
                        if key not in ["stock_code", "score_date"]:
                            update_fields.append(f"{key} = ?")
                            update_values.append(value)

                    update_values.extend([stock_code, score_data.get("score_date")])
                    update_query = f"""
                        UPDATE fundamental_scores
                        SET {', '.join(update_fields)}
                        WHERE stock_code = ? AND score_date = ?
                    """
                    await db.execute(update_query, update_values)
                else:
                    # 插入新记录
                    fields = ["stock_code"] + list(score_data.keys())
                    placeholders = ["?"] * len(fields)
                    values = [stock_code] + list(score_data.values())

                    insert_query = f"""
                        INSERT INTO fundamental_scores ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                    """
                    await db.execute(insert_query, values)

                await db.commit()
                return True
        except Exception as e:
            logger.error(f"保存基本面综合评分失败: {e}")
            return False

    async def get_fundamental_score(self, stock_code: str, score_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """获取基本面综合评分"""
        try:
            async with self.get_connection() as db:
                if score_date:
                    cursor = await db.execute(
                        """SELECT * FROM fundamental_scores
                           WHERE stock_code = ? AND score_date = ?
                           ORDER BY score_date DESC LIMIT 1""",
                        (stock_code, score_date)
                    )
                else:
                    cursor = await db.execute(
                        """SELECT * FROM fundamental_scores
                           WHERE stock_code = ?
                           ORDER BY score_date DESC LIMIT 1""",
                        (stock_code,)
                    )

                row = await cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    return dict(zip(columns, row))
                return None
        except Exception as e:
            logger.error(f"获取基本面综合评分失败: {e}")
            return None

    async def get_top_fundamental_stocks(self, limit: int = 20, min_score: float = 60.0) -> List[Dict[str, Any]]:
        """获取基本面评分最高的股票"""
        try:
            async with self.get_connection() as db:
                cursor = await db.execute(
                    """SELECT fs.*, s.name, s.industry
                       FROM fundamental_scores fs
                       JOIN stocks s ON fs.stock_code = s.code
                       WHERE fs.overall_score >= ?
                       ORDER BY fs.overall_score DESC, fs.score_date DESC
                       LIMIT ?""",
                    (min_score, limit)
                )

                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]
                return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.error(f"获取基本面评分最高的股票失败: {e}")
            return []

    async def get_financial_indicators_history(self, stock_code: str, limit: int = 10) -> List[Dict[str, Any]]:
        """获取财务指标历史数据"""
        try:
            async with self.get_connection() as db:
                cursor = await db.execute(
                    """SELECT * FROM financial_indicators
                       WHERE stock_code = ?
                       ORDER BY end_date DESC
                       LIMIT ?""",
                    (stock_code, limit)
                )

                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]
                return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.error(f"获取财务指标历史数据失败: {e}")
            return []

    async def get_latest_financial_statements(self, stock_code: str) -> Dict[str, Any]:
        """获取最新财务报表数据"""
        try:
            async with self.get_connection() as db:
                result = {}

                # 获取最新利润表
                cursor = await db.execute(
                    """SELECT * FROM income_statements
                       WHERE stock_code = ?
                       ORDER BY f_end_date DESC
                       LIMIT 1""",
                    (stock_code,)
                )
                income_row = await cursor.fetchone()
                if income_row:
                    columns = [description[0] for description in cursor.description]
                    result["income_statement"] = dict(zip(columns, income_row))

                # 获取最新资产负债表
                cursor = await db.execute(
                    """SELECT * FROM balance_sheets
                       WHERE stock_code = ?
                       ORDER BY f_end_date DESC
                       LIMIT 1""",
                    (stock_code,)
                )
                balance_row = await cursor.fetchone()
                if balance_row:
                    columns = [description[0] for description in cursor.description]
                    result["balance_sheet"] = dict(zip(columns, balance_row))

                # 获取最新现金流量表
                cursor = await db.execute(
                    """SELECT * FROM cash_flow_statements
                       WHERE stock_code = ?
                       ORDER BY f_end_date DESC
                       LIMIT 1""",
                    (stock_code,)
                )
                cash_flow_row = await cursor.fetchone()
                if cash_flow_row:
                    columns = [description[0] for description in cursor.description]
                    result["cash_flow_statement"] = dict(zip(columns, cash_flow_row))

                return result
        except Exception as e:
            logger.error(f"获取最新财务报表数据失败: {e}")
            return {}

    async def get_dividend_history(self, stock_code: str, limit: int = 10) -> List[Dict[str, Any]]:
        """获取分红历史数据"""
        try:
            async with self.get_connection() as db:
                cursor = await db.execute(
                    """SELECT * FROM dividend_data
                       WHERE stock_code = ?
                       ORDER BY end_date DESC
                       LIMIT ?""",
                    (stock_code, limit)
                )

                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]
                return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.error(f"获取分红历史数据失败: {e}")
            return []

    async def get_top_shareholders(self, stock_code: str, limit: int = 10) -> List[Dict[str, Any]]:
        """获取前十大股东"""
        try:
            async with self.get_connection() as db:
                cursor = await db.execute(
                    """SELECT * FROM shareholder_data
                       WHERE stock_code = ?
                       ORDER BY hold_ratio DESC, end_date DESC
                       LIMIT ?""",
                    (stock_code, limit)
                )

                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]
                return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.error(f"获取前十大股东失败: {e}")
            return []

    async def get_stock_basic_extended(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """获取股票基本信息扩展数据"""
        try:
            async with self.get_connection() as db:
                cursor = await db.execute(
                    "SELECT * FROM stock_basic_extended WHERE stock_code = ?",
                    (stock_code,)
                )

                row = await cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    return dict(zip(columns, row))
                return None
        except Exception as e:
            logger.error(f"获取股票基本信息扩展数据失败: {e}")
            return None