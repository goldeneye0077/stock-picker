
import asyncio
import sys
import os

# 添加 src 目录到路径
sys.path.append('src')
from utils.database import init_database

async def main():
    print("正在容器内初始化数据库...")
    try:
        await init_database()
        print("数据库表结构创建成功！")
        
        # 启用 WAL
        import aiosqlite
        async with aiosqlite.connect("/data/stock_picker.db") as db:
            await db.execute("PRAGMA journal_mode=WAL;")
            print("WAL 模式已启用")
            
    except Exception as e:
        print(f"数据库初始化失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
