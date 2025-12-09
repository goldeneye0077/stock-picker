import asyncio
import aiosqlite
from pathlib import Path

DATABASE_PATH = Path("e:/stock_an/stock-picker/data/stock_picker.db")

async def check_db():
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM realtime_quotes")
        count_rt = await cursor.fetchone()
        print(f"Realtime Quotes Count: {count_rt[0]}")

        cursor = await db.execute("SELECT COUNT(*) FROM klines")
        count_kl = await cursor.fetchone()
        print(f"Klines Count: {count_kl[0]}")

        cursor = await db.execute("SELECT MAX(date) FROM klines")
        max_date = await cursor.fetchone()
        print(f"Max Date in Klines: {max_date[0]}")
        
        if max_date[0]:
             cursor = await db.execute(f"SELECT COUNT(*) FROM klines WHERE date = '{max_date[0]}'")
             count_latest = await cursor.fetchone()
             print(f"Klines Count for {max_date[0]}: {count_latest[0]}")

if __name__ == "__main__":
    asyncio.run(check_db())
