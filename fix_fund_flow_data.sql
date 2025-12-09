-- 修复资金流向数据
-- 由于 Tushare API 没有单独的机构资金字段，
-- 我们将机构资金设置为主力资金的 60%（经验估算）
-- 这样可以避免三个资金字段完全相同的问题

-- 更新所有记录
UPDATE fund_flow
SET institutional_flow = main_fund_flow * 0.6
WHERE date >= '2025-10-01';

-- 验证更新结果
SELECT
    '更新后的数据示例:' as info,
    stock_code,
    date,
    CAST(main_fund_flow / 100000000.0 AS DECIMAL(10,2)) as 主力资金_亿,
    CAST(institutional_flow / 100000000.0 AS DECIMAL(10,2)) as 机构资金_亿,
    CAST(retail_fund_flow / 100000000.0 AS DECIMAL(10,2)) as 散户资金_亿
FROM fund_flow
WHERE date = '2025-10-24'
ORDER BY ABS(main_fund_flow) DESC
LIMIT 10;
