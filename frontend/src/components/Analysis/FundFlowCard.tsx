/**
 * 资金流向卡片组件
 * 显示主力资金、机构资金、散户资金的流向情况
 * 性能优化：使用 useCallback 和 React.memo
 */

import React, { useCallback } from 'react';
import { Card, List, Progress, Space, Button, Typography, DatePicker, Tooltip } from 'antd';
import { FundOutlined, SyncOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useFundFlow } from '../../hooks/useFundFlow';
import dayjs, { Dayjs } from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const FundFlowCardComponent: React.FC = () => {
  const { data, loading, fetchData, updateParams, params } = useFundFlow({ days: 30 });

  // 处理日期范围变化
  const handleDateChange = useCallback((dates: null | [Dayjs | null, Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      // 用户选择了日期范围
      updateParams({
        dateFrom: dates[0].format('YYYY-MM-DD'),
        dateTo: dates[1].format('YYYY-MM-DD'),
        days: undefined // 清除 days 参数，使用日期范围
      });
    } else {
      // 用户清空了日期选择，恢复默认使用最近30天
      updateParams({
        dateFrom: undefined,
        dateTo: undefined,
        days: 30
      });
    }
  }, [updateParams]);

  // 使用 useCallback 优化 renderItem，避免每次渲染都创建新函数
  const renderItem = useCallback((item: any) => (
    <List.Item>
      <div style={{ width: '100%' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8
        }}>
          <span>{item.type}</span>
          <span style={{ fontWeight: 'bold' }}>{item.amount}</span>
        </div>
        <Progress
          percent={item.percent}
          strokeColor={item.color}
          showInfo={false}
        />
      </div>
    </List.Item>
  ), []);

  // 获取当前选中的日期范围（用于 RangePicker 的 value）
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
            title={
              <div style={{ fontSize: '12px' }}>
                <div><strong>数据说明：</strong></div>
                <div>• 数据来源：东方财富市场资金流向（moneyflow_mkt_dc）</div>
                <div>• 超大单：单笔成交 ≥ 100万元（机构大额交易）</div>
                <div>• 大单：单笔成交 50万-100万元（大户交易）</div>
                <div>• 中单：单笔成交 10万-50万元（中户交易）</div>
                <div>• 小单：单笔成交 &lt; 10万元（散户交易）</div>
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #444' }}>
                  <strong>分析要点：</strong><br/>
                  • 超大单+大单流入：机构资金介入<br/>
                  • 中单+小单流出：散户资金离场<br/>
                  • 主力资金 = 超大单 + 大单
                </div>
              </div>
            }
            placement="right"
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
            style={{ width: 240 }}
            disabled={loading}
          />
          <Button
            size="small"
            icon={<SyncOutlined spin={loading} />}
            onClick={fetchData}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <List
        loading={loading}
        dataSource={data}
        renderItem={renderItem}
      />
    </Card>
  );
};

// 使用 React.memo 优化组件性能，避免不必要的重新渲染
export const FundFlowCard = React.memo(FundFlowCardComponent);
