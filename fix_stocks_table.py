#!/usr/bin/env python3
"""
修复 stocks 表数据缺失的问题
"""
import sqlite3
import sys
import os
import asyncio

# 添加data-service路径以导入tushare客户端
sys.path.append('data-service/src')
# 尝试导入，如果失败可能是因为路径问题，这里直接假设路径正确，因为我在根目录运行
try:
    from data_sources.tushare_client import TushareClient
except ImportError:
    print("无法导入 TushareClient，请确保在项目根目录运行此脚本")
    sys.exit(1)

async def fix_stocks():
    print("开始修复 stocks 表...")
    
    # 检查环境变量
    token = os.getenv('TUSHARE_TOKEN')
    if not token:
        # 尝试从 data-service/.env 读取
        try:
            env_path = os.path.join('data-service', '.env')
            if os.path.exists(env_path):
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip().startswith('TUSHARE_TOKEN='):
                            token = line.strip().split('=', 1)[1].strip()
                            os.environ['TUSHARE_TOKEN'] = token
                            print("已从 data-service/.env 加载 TUSHARE_TOKEN")
                            break
        except Exception as e:
            print(f"读取 .env 文件出错: {e}")
            
    if not os.getenv('TUSHARE_TOKEN'):
        print("错误: 未找到 TUSHARE_TOKEN 环境变量，且无法从 data-service/.env 读取")
        print("请设置 TUSHARE_TOKEN 环境变量或确保 data-service/.env 文件存在且包含 TUSHARE_TOKEN")
        return

    client = TushareClient()
    if not client.is_available():
        print("Tushare 客户端初始化失败")
        return

    print("正在从 Tushare 获取最新股票列表...")
    df = await client.get_stock_basic()
    
    if df is None or df.empty:
        print("未获取到股票数据，请检查 Token 配额或网络")
        return

    print(f"获取到 {len(df)} 条股票数据，准备写入数据库...")

    conn = sqlite3.connect('data/stock_picker.db')
    cursor = conn.cursor()

    # 确保表存在 (参考 clear_and_download_all_stocks.py 中的字段，但增加了一些以匹配 TushareClient 返回的字段)
    # 注意：需要检查现有表结构，避免结构冲突。
    # 不过由于现在表是空的，或者我们只是插入数据，REPLACE INTO 会处理主键冲突。
    # 这里我们主要依赖现有的表结构。如果表被删除了，我们需要重建。
    
    # 检查表是否存在
    cursor.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='stocks'")
    if cursor.fetchone()[0] == 0:
        print("stocks 表不存在，正在创建...")
        cursor.execute("""
            CREATE TABLE stocks (
                code TEXT PRIMARY KEY,
                name TEXT,
                exchange TEXT,
                industry TEXT,
                area TEXT,
                market TEXT,
                list_date TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    
    count = 0
    # TushareClient.get_stock_basic 返回字段: ts_code,symbol,name,area,industry,market,exchange,list_date
    
    # 检查表列名以确定要插入哪些字段
    cursor.execute("PRAGMA table_info(stocks)")
    columns = [info[1] for info in cursor.fetchall()]
    print(f"当前 stocks 表字段: {columns}")

    for _, row in df.iterrows():
        try:
            # 构建插入语句，只插入表中存在的字段
            insert_fields = ['code', 'name', 'exchange', 'industry', 'updated_at']
            values = [
                row['symbol'],
                row['name'],
                row['exchange'],
                row['industry'] if row['industry'] else '未知'
            ]
            
            if 'area' in columns:
                insert_fields.append('area')
                values.append(row['area'])
            
            if 'market' in columns:
                insert_fields.append('market')
                values.append(row['market'])
                
            if 'list_date' in columns:
                insert_fields.append('list_date')
                values.append(row['list_date'])
            
            placeholders = ', '.join(['?'] * len(insert_fields))
            sql = f"INSERT OR REPLACE INTO stocks ({', '.join(insert_fields)}) VALUES ({placeholders})"
            
            # 这里需要追加 updated_at 的值，但它已经在 values 列表构建之前被写死了在 sql 中吗？
            # 不，我在 values 列表中还没加 updated_at 的值，但在 insert_fields 加了。
            # 修正：updated_at 应该是 datetime('now')，不能通过参数传递，或者参数传递字符串。
            # 为了简单，我们把 updated_at 从 insert_fields 移除，直接在 SQL 中写 datetime('now')
            
            real_insert_fields = [f for f in insert_fields if f != 'updated_at']
            real_values = values # values 列表目前正好对应除了 updated_at 之外的字段（如果我没弄错的话）
            # 等等，上面代码逻辑有点乱，重新整理一下
            
            db_values = []
            db_fields = []
            
            db_fields.append('code')
            db_values.append(row['symbol'])
            
            db_fields.append('name')
            db_values.append(row['name'])
            
            db_fields.append('exchange')
            db_values.append(row['exchange'])
            
            db_fields.append('industry')
            db_values.append(row['industry'] if row['industry'] else '未知')

            if 'area' in columns:
                db_fields.append('area')
                db_values.append(row['area'])

            if 'market' in columns:
                db_fields.append('market')
                db_values.append(row['market'])

            if 'list_date' in columns:
                db_fields.append('list_date')
                db_values.append(row['list_date'])
            
            # 添加 updated_at
            if 'updated_at' in columns:
                # 使用 SQL 函数，不通过参数传递
                placeholders = ', '.join(['?'] * len(db_values)) + ", datetime('now')"
                sql_fields = ', '.join(db_fields) + ", updated_at"
            else:
                placeholders = ', '.join(['?'] * len(db_values))
                sql_fields = ', '.join(db_fields)
            
            sql = f"INSERT OR REPLACE INTO stocks ({sql_fields}) VALUES ({placeholders})"
            
            cursor.execute(sql, db_values)
            count += 1
        except Exception as e:
            print(f"插入 {row['symbol']} 失败: {e}")

    conn.commit()
    conn.close()
    print(f"修复完成！已成功插入/更新 {count} 条股票记录。")

if __name__ == "__main__":
    asyncio.run(fix_stocks())
