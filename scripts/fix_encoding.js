const fs = require('fs');
const path = 'e:/stock_an/stock-picker-latest/frontend/src/pages/Home.tsx';
let c = fs.readFileSync(path, 'utf8');

const replacements = [
    // Line 235: 实时数据更新中
    ['实时数据更新\uFFFD?', '实时数据更新中'],
    // Line 244: hero desc
    ['帮助您\uFFFD?4,000+ 股票\uFFFD?\uFFFD\uFFFD速锁定交易机会\uFFFD?\uFFFDAI 驱动的策略回测，实时监控市场动\uFFFD?\uFFFD\uFFFD??',
        '帮助您在 4,000+ 股票中快速锁定交易机会。AI 驱动的策略回测，实时监控市场动态。'],
    // Line 261: 数据准确率
    ['?????\u003c/div>', '数据准确率\u003c/div>'],
    // Line 276: 浏览
    ['浏\uFFFD?全部股票', '浏览全部股票'],
    // Line 291: 30天
    ['30?\u003c/span>', '30天\u003c/span>'],
    // Line 347: 较昨日
    ['较昨\uFFFD?{formatSignedNumber', '较昨日 {formatSignedNumber'],
    // Line 375: 优秀/一般
    ["? '??' : '??')", "? '优秀' : '一般')"],
    // Line 437: 详细信息
    ['aria-label=\"?????\"\u003e', 'aria-label=\"详细信息\"\u003e'],
    // Line 461: 实时热点资金
    ['??????\u003c/h2>', '实时热点资金\u003c/h2>'],
    // Line 464: subtitle
    ['?????????????\u003c/p>', '追踪主力动向，把握板块机会\u003c/p>'],
    // Line 468: 查看更多
    ['查看更\uFFFD?', '查看更多'],
    // Line 477: 热点资金表格
    ['aria-label=\"\uFFFD?\uFFFD\uFFFD资金表格\"', 'aria-label=\"热点资金表格\"'],
    // Line 482: 涨跌幅
    ['???\u003c/th>\r\n                             \u003cth scope=\"col\"\u003e?????\u003c/th>\r\n                             \u003cth scope=\"col\"\u003e????',
        '涨跌幅\u003c/th>\r\n                             \u003cth scope=\"col\"\u003e主力净流入\u003c/th>\r\n                             \u003cth scope=\"col\"\u003e领涨个股'],
    // Line 553-556: 近月战绩 subtitle 括号
    ['`\uFFFD?{monthlySummary.periodText}）`', '`（${monthlySummary.periodText}）`'],
    ['`\uFFFD?{tradeDate}）`', '`（${tradeDate}）`'],
    ['`\uFFFD?{NO_DATA_TEXT}）`', '`（${NO_DATA_TEXT}）`'],
    // Line 562: 核心统计数据
    ['核心统\uFFFD?数据', '核心统计数据'],
    // Line 563: 月度统计指标
    ['月度统\uFFFD?指标', '月度统计指标'],
    // Line 568: 全市场
    ['全市\uFFFD?{monthlyStatsLoading', '全市场 {monthlyStatsLoading'],
    // Line 613: 全市场 bar name
    ['???\u003c/span>\r\n                                     \u003cspan className=\"sq-home__strategy-bar-value\"\u003e{formatPercent(monthlySummary.marketRate)}',
        '全市场\u003c/span>\r\n                                     \u003cspan className=\"sq-home__strategy-bar-value\"\u003e{formatPercent(monthlySummary.marketRate)}'],
    // Line 624: 详细统计
    ['详细统\uFFFD?', '详细统计'],
    // Line 627: 累计入选
    ['????\u003c/div>\r\n                         \u003cdiv className=\"sq-home__mini-value\"\u003e\r\n                           {monthlyStatsLoading ? \u003cSpin',
        '累计入选\u003c/div>\r\n                         \u003cdiv className=\"sq-home__mini-value\"\u003e\r\n                           {monthlyStatsLoading ? \u003cSpin'],
    // Line 633: 涨停个数
    ['???\u003c/div>\r\n                         \u003cdiv className=\"sq-home__mini-value sq-home__mini-value--up\"\u003e',
        '涨停个数\u003c/div>\r\n                         \u003cdiv className=\"sq-home__mini-value sq-home__mini-value--up\"\u003e'],
    // Line 639: 统计天数
    ['统\uFFFD?天数', '统计天数'],
    // Line 651, 678, 705: 勋章 emoji
    ['\uFFFD? 金牌', '🥇 金牌'],
    ['\uFFFD? 银牌', '🥈 银牌'],
    ['\uFFFD? 铜牌', '🥉 铜牌'],
    // Line 788: L2 feature desc
    ['L2 ?????????????????????\u003c/p>', 'L2 行情深度追踪，毫秒级数据更新，精准把握市场变化\u003c/p>'],
    // Line 789: 功能标签
    ['功能标\uFFFD?\"', '功能标签\"'],
    // Line 791: 智能预警
    ['智能预\uFFFD?\u003c/span>', '智能预警\u003c/span>'],
    // Line 826: AI feature desc
    ['AI ???????????????????\u003c/p>', 'AI 驱动的智能数据分析，助力科学决策\u003c/p>'],
    // Line 829: 实时回测
    ['???\u003c/span>\r\n                     \u003c/div>\r\n                   \u003c/div>\r\n                 \u003c/article>\r\n               \u003c/section>',
        '实时回测\u003c/span>\r\n                     \u003c/div>\r\n                   \u003c/div>\r\n                 \u003c/article>\r\n               \u003c/section>'],
    // Line 845: 市场洞察 subtitle
    ['实时追踪市场动\uFFFD?\uFFFD，深度解\uFFFD?\uFFFD?\uFFFD\uFFFD事件', '实时追踪市场动态，深度解读热点事件'],
    // Line 878: 更多洞察
    ['更\uFFFD?洞察', '更多洞察'],
];

let count = 0;
for (const [from, to] of replacements) {
    if (c.includes(from)) {
        c = c.replace(from, to);
        count++;
    }
}

// Also handle any remaining ???? patterns that weren't caught
// But be careful not to replace legitimate question marks

fs.writeFileSync(path, c, 'utf8');
console.log(`Fixed ${count} of ${replacements.length} replacements`);

// Verify no more broken chars remain
const remaining = (c.match(/[\uFFFD]/g) || []).length;
console.log(`Remaining \uFFFD chars: ${remaining}`);
const questionMarkRuns = (c.match(/\?{3,}/g) || []);
console.log(`Remaining ???+ runs: ${questionMarkRuns.length}`, questionMarkRuns.map(m => m.length));
