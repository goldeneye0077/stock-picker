# 完善量鲸后台数据与图表渲染任务 (P2)

## Goal
完成首页剩余的数据绑定与图表渲染任务，包括收益曲线的回看、换手率的日环比变化，以及修复热点资金板块中的资金及涨跌幅信息。

## Phase 1: 策略收益曲线图表渲染
### 依赖
- ECharts 图表库 (`echarts`, `echarts-for-react` 等) 已安装或按需引入。
- `dashboard.ts` 和 `AnalysisRepository.ts` 已经支持或需要添加 `/api/home/dashboard/strategy` 时序端点（或通过现有接口附带）。

### 步骤
1. **获取历史收益数据**:
   - 如果当前 `getBuySignals` 等无法构建真实的时序收益，应编写一个仓位/回测表查询逻辑，或者用历史策略的表现评估合成一条真实（或估算）的收益曲线。
   - 在 `AnalysisRepository.ts` 中新增方法 `getStrategyYieldCurve(days)` 返回过去 `days` 天的日期和对应累计收益率。
2. **后端 API 修改**:
   - 将这部分曲线数据添加到 `/api/home/dashboard` 的 `strategy.chartData` 字段中返回，格式例如 `[{ date: '2026-02-11', value: 110.5 }, ...]`。
3. **前端渲染更新**:
   - 修改 `frontend/src/pages/Home.tsx` 中 `sq-home__chart-body` 区域的 `<div style={{...}}>{NO_DATA_TEXT}</div>`。
   - 引入并使用 ECharts 绘制收益曲线。设置 X 轴为日期，Y 轴为百分比收益。使用深色主题配合 UI (`tooltip`, `areaStyle` 渐变等)。

## Phase 2: 全A成交额日环比 (turnoverChange)
### 背景
目前 `getTurnoverSummary` 查询了 `quote_history` 表的前 1 日数据。由于行情快照的时序可能不是精确到每天 24 小时内的相同点，需要确保匹配逻辑能够稳健工作。当前 `totalTurnover` 能够显示 2.2 万亿是因为拿了最新一天的行情数据。

### 步骤
1. **完善 `getTurnoverSummary` SQL**:
   - 它目前按 `updated_at >= datetime('now', '-1 day')`。因为数据有断层，最好改为获取**最新交易日**的成交额汇总，以及**前一交易日**的成交额汇总。
   - 修改逻辑：先查询 `klines` 或 `daily_basic` 最新一天的日期，然后再查这一天所有股票的 `amount` 总和。同理查上一天的进行对比。
2. **连接前后端**:
   - 确保 `dashboard.ts` 中 `totalTurnover` 和 `turnoverChange` 正确解包，前端 `formatPercent` 解析并按红亮色展示出变化（如 `+2.4%`）。

## Phase 3: 热点资金板块数据修正
### 背景
首页目前显示“热点资金”的涨幅为 `+0.0%`、净流入为 `+0.0亿`，由于 `getHotSectorStocks` 中的 `sector_pct_change` 和 `sector_money_flow` 在连接查询中未正确映射。

### 步骤
1. **修正 AnalysisRepository.getHotSectorStocks**:
   - 检查该查询。发现它查了 `stocks s LEFT JOIN sector_moneyflow sm` 但 `sector_moneyflow` 表里的板块名称可能带后缀，导致无法精确映射涨跌幅。
   - 另一种可能是 `sector_moneyflow` 中根本没找到当天的板块。检查数据库 `sector_moneyflow` 表中是否有最近交易日的数据。如果没有数据，这能解释 `+0.0`，此时需要运行一次抓取该表的数据（如 `fill_extra_data.py` 里调用 `pro.moneyflow_hsgt` 或 `pro.moneyflow_sector`）。
   - 如果抓取了，在 SQL 语句里修复关联字段并返回最新的 `%` 数据。

## 验证与验收
1. 在浏览器刷新页面，首页“策略收益曲线”应当出现图表。
2. “全A成交额”下方应该有基于昨日数据的百分比涨幅提示。
3. “热点资金”表格不再是全是 0.0，而是呈现实际市场的波动极值。
