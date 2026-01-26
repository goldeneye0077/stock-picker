#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
CONTAINER_NAME="${CONTAINER_NAME:-stock-picker-data-service}"
DATA_SERVICE_URL_IN_CONTAINER="${DATA_SERVICE_URL_IN_CONTAINER:-http://127.0.0.1:8001}"

is_weekday() {
  local dow
  dow="$(date +%u)"
  [ "$dow" -ge 1 ] && [ "$dow" -le 5 ]
}

post_in_container() {
  local url="$1"
  docker exec -i "${CONTAINER_NAME}" python - <<PY
import urllib.request
req = urllib.request.Request("${url}", method="POST")
with urllib.request.urlopen(req, timeout=30) as resp:
    resp.read()
print(resp.status)
PY
}

if ! is_weekday; then
  exit 0
fi

case "${MODE}" in
  open_auction)
    post_in_container "${DATA_SERVICE_URL_IN_CONTAINER}/api/quotes/update-auction?sync=false"
    ;;
  close_collect)
    post_in_container "${DATA_SERVICE_URL_IN_CONTAINER}/api/data/batch-collect-7days?include_moneyflow=true&include_auction=false"
    ;;
  *)
    echo "Usage: $0 {open_auction|close_collect}"
    exit 2
    ;;
esac
