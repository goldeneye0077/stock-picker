import React, { useCallback } from 'react';
import { Button, Card, DatePicker, List, Progress, Space, Tooltip, Typography } from 'antd';
import { FundOutlined, QuestionCircleOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useFundFlow } from '../../hooks/useFundFlow';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function FundFlowCardComponent(): React.JSX.Element {
  const { data, loading, fetchData, updateParams, params } = useFundFlow({ days: 30 });

  const handleDateChange = useCallback((dates: null | [Dayjs | null, Dayjs | null]) => {
    if (dates?.[0] && dates?.[1]) {
      updateParams({
        dateFrom: dates[0].format('YYYY-MM-DD'),
        dateTo: dates[1].format('YYYY-MM-DD'),
        days: undefined,
      });
      return;
    }

    updateParams({
      dateFrom: undefined,
      dateTo: undefined,
      days: 30,
    });
  }, [updateParams]);

  const renderItem = useCallback((item: { type: string; amount: string; percent: number; color: string }) => (
    <List.Item>
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>{item.type}</span>
          <span style={{ fontWeight: 700 }}>{item.amount}</span>
        </div>
        <Progress percent={item.percent} strokeColor={item.color} showInfo={false} />
      </div>
    </List.Item>
  ), []);

  const dateRange: [Dayjs, Dayjs] | null = params.dateFrom && params.dateTo
    ? [dayjs(params.dateFrom), dayjs(params.dateTo)]
    : null;

  return (
    <Card
      title={
        <Space>
          <FundOutlined />
          <Title level={5} style={{ margin: 0 }}>资金流向分析</Title>
          <Tooltip
            placement="right"
            title={(
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <div><strong>数据说明</strong></div>
                <div>数据来源：东方财富市场资金流向（moneyflow_mkt_dc）</div>
                <div>超大单：单笔成交大于等于 100 万元</div>
                <div>大单：单笔成交 50 万到 100 万元</div>
                <div>中单：单笔成交 10 万到 50 万元</div>
                <div>小单：单笔成交小于 10 万元</div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #444' }}>
                  <strong>解读要点</strong>
                  <div>主力资金 = 超大单 + 大单</div>
                  <div>主力净流入通常代表机构资金在持续介入</div>
                  <div>中小单流出常见于散户资金离场</div>
                </div>
              </div>
            )}
          >
            <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'help' }} />
          </Tooltip>
        </Space>
      }
      extra={
        <Space>
          <RangePicker
            size="small"
            value={dateRange}
            onChange={handleDateChange}
            placeholder={['开始日期', '结束日期']}
            format="YYYY-MM-DD"
            allowClear
            allowEmpty={[true, true]}
            style={{ width: 240 }}
            disabled={loading}
          />
          <Button size="small" icon={<SyncOutlined spin={loading} />} onClick={fetchData} loading={loading}>
            刷新
          </Button>
        </Space>
      }
    >
      {data.length === 0 && !loading ? (
        <Text type="secondary">暂无资金流向数据</Text>
      ) : (
        <List loading={loading} dataSource={data} renderItem={renderItem} />
      )}
    </Card>
  );
}

export const FundFlowCard = React.memo(FundFlowCardComponent);
