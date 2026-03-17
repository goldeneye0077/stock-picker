#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
CONTAINER_NAME="${CONTAINER_NAME:-stock-picker-data-service}"
SCHEDULER_TZ="${SCHEDULER_TZ:-Asia/Shanghai}"
CRON_TASK_DATE="${CRON_TASK_DATE:-}"

is_weekday() {
  local dow
  dow="$(date +%u)"
  [ "$dow" -ge 1 ] && [ "$dow" -le 5 ]
}

log_line() {
  printf '[%s] %s\n' "$(date '+%F %T %z')" "$*"
}

run_in_container() {
  local mode="$1"
  docker exec -i \
    -e STOCK_PICKER_CRON_MODE="${mode}" \
    -e STOCK_PICKER_CRON_TZ="${SCHEDULER_TZ}" \
    -e STOCK_PICKER_CRON_TASK_DATE="${CRON_TASK_DATE}" \
    "${CONTAINER_NAME}" \
    python - <<'PY'
import asyncio
import os
from datetime import datetime
from zoneinfo import ZoneInfo

mode = os.environ["STOCK_PICKER_CRON_MODE"]
task_date = os.environ.get("STOCK_PICKER_CRON_TASK_DATE", "").strip()
task_tz = ZoneInfo(os.environ.get("STOCK_PICKER_CRON_TZ", "Asia/Shanghai"))


async def run_open_auction() -> None:
    from src.data_sources.tushare_client import TushareClient
    from src.routes.data_collection import fetch_stocks_task
    from src.routes.quotes import update_auction_from_tushare_task

    await fetch_stocks_task()
    client = TushareClient()
    inserted = int(await update_auction_from_tushare_task(client, trade_date=task_date or None) or 0)
    print(f"auction_inserted={inserted}")


async def run_close_collect() -> None:
    from src.scheduler import collect_daily_klines_with_retry

    trade_date = task_date or datetime.now(task_tz).strftime("%Y-%m-%d")
    kline_result = await collect_daily_klines_with_retry(trade_date=trade_date, source="host-cron")
    print(f"kline_result={kline_result}")


async def main() -> None:
    print(f"mode={mode} task_date={task_date or 'today'}")
    if mode == "open_auction":
        await run_open_auction()
        return
    if mode == "close_collect":
        await run_close_collect()
        return
    raise SystemExit(f"Usage: {mode} is not supported")


asyncio.run(main())
PY
}

if ! is_weekday; then
  log_line "skip non-weekday mode=${MODE}"
  exit 0
fi

log_line "start mode=${MODE} container=${CONTAINER_NAME} task_date=${CRON_TASK_DATE:-today}"

case "${MODE}" in
  open_auction)
    run_in_container "open_auction"
    ;;
  close_collect)
    run_in_container "close_collect"
    ;;
  *)
    echo "Usage: $0 {open_auction|close_collect}"
    exit 2
    ;;
esac

log_line "finish mode=${MODE}"
