/**
 * 板块资金流向分析卡片
 * 分析各行业板块的资金流向情况
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Space, Statistic, Row, Col, Empty, Button, Tooltip, message, DatePicker } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  FundOutlined,
  SyncOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchSectorMoneyflowData } from '../../services/analysisService';
import type { FundFlowParams } from '../../services/analysisService';
import dayjs, { Dayjs } from 'dayjs';
import { A_SHARE_COLORS } from '../../utils/constants';

const { RangePicker } = DatePicker;

interface SectorMoneyFlowData {
  key: string;
  trade_date: string;
  name: string;
  pct_change: number;
  close: number;
  net_amount: number;
  net_amount_rate: number;
  buy_elg_amount: number;
  buy_elg_amount_rate: number;
  buy_lg_amount: number;
  buy_lg_amount_rate: number;
  buy_md_amount: number;
  buy_md_amount_rate: number;
  buy_sm_amount: number;
  buy_sm_amount_rate: number;
  rank: number;
}

const SectorMoneyFlowCardComponent: React.FC = () => {
  const [data, setData] = useState<SectorMoneyFlowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [params, setParams] = useState<FundFlowParams>({ days: 30 });

  // 获取板块资金流向数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSectorMoneyflowData(params);

      if (result.sectorFlow && Array.isArray(result.sectorFlow)) {
        // 转换数据格式
        const formattedData: SectorMoneyFlowData[] = result.sectorFlow.map((item: any, index: number) => ({
          key: String(index + 1),
          trade_date: item.trade_date || '',
          name: item.name || '',
          pct_change: item.pct_change || 0,
          close: item.close || 0,
          net_amount: item.net_amount || 0,
          net_amount_rate: item.net_amount_rate || 0,
          buy_elg_amount: item.buy_elg_amount || 0,
          buy_elg_amount_rate: item.buy_elg_amount_rate || 0,
          buy_lg_amount: item.buy_lg_amount || 0,
          buy_lg_amount_rate: item.buy_lg_amount_rate || 0,
          buy_md_amount: item.buy_md_amount || 0,
          buy_md_amount_rate: item.buy_md_amount_rate || 0,
          buy_sm_amount: item.buy_sm_amount || 0,
          buy_sm_amount_rate: item.buy_sm_amount_rate || 0,
          rank: item.rank || 0
        }));

        setData(formattedData);
        setSummary(result.summary);
        message.success('板块资金流向数据已刷新');
      }
    } catch (error) {
      console.error('Error fetching sector money flow data:', error);
      message.error('获取板块资金流向数据失败');
    } finally {
      setLoading(false);
    }
  }, [params]);

  // 初始加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 处理日期范围变化
  const handleDateChange = useCallback((dates: null | [Dayjs | null, Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      setParams({
        dateFrom: dates[0].format('YYYY-MM-DD'),
        dateTo: dates[1].format('YYYY-MM-DD'),
        days: undefined
      });
    } else {
      setParams({
        dateFrom: undefined,
        dateTo: undefined,
        days: 30
      });
    }
  }, []);

  // 获取当前选中的日期范围
  const dateRange: [Dayjs, Dayjs] | null = params.dateFrom && params.dateTo
    ? [dayjs(params.dateFrom), dayjs(params.dateTo)]
    : null;

  const columns: ColumnsType<SectorMoneyFlowData> = [
    {
      title: '板块名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      fixed: 'left',
      render: (text: string) => (
        <Space>
          <FundOutlined style={{ color: '#1890ff' }} />
          <strong>{text}</strong>
        </Space>
      )
    },
    {
      title: '交易日期',
      dataIndex: 'trade_date',
      key: 'trade_date',
      width: 100,
      render: (text: string) => dayjs(text).format('MM-DD')
    },
    {
      title: '涨跌幅',
      dataIndex: 'pct_change',
      key: 'pct_change',
      width: 90,
      render: (value: number) => (
        <Tag color={value > 0 ? A_SHARE_COLORS.RISE : value < 0 ? A_SHARE_COLORS.FALL : 'default'}>
          {value > 0 ? '+' : ''}{value.toFixed(2)}%
        </Tag>
      ),
      sorter: (a, b) => a.pct_change - b.pct_change
    },
    {
      title: '主力净流入',
      dataIndex: 'net_amount',
      key: 'net_amount',
      width: 120,
      render: (value: number) => (
        <span style={{
          color: value > 0 ? A_SHARE_COLORS.RISE : value < 0 ? A_SHARE_COLORS.FALL : '#666',
          fontWeight: 'bold'
        }}>
          {value > 0 ? '+' : ''}{(value / 100000000).toFixed(2)}亿
        </span>
      ),
      sorter: (a, b) => a.net_amount - b.net_amount,
      defaultSortOrder: 'descend'
    },
    {
      title: '超大单',
      dataIndex: 'buy_elg_amount',
      key: 'buy_elg_amount',
      width: 100,
      render: (value: number) => (
        <span style={{ color: value > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL }}>
          {value > 0 ? '+' : ''}{(value / 100000000).toFixed(2)}亿
        </span>
      ),
      sorter: (a, b) => a.buy_elg_amount - b.buy_elg_amount
    },
    {
      title: '大单',
      dataIndex: 'buy_lg_amount',
      key: 'buy_lg_amount',
      width: 100,
      render: (value: number) => (
        <span style={{ color: value > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL }}>
          {value > 0 ? '+' : ''}{(value / 100000000).toFixed(2)}亿
        </span>
      ),
      sorter: (a, b) => a.buy_lg_amount - b.buy_lg_amount
    },
    {
      title: '中单',
      dataIndex: 'buy_md_amount',
      key: 'buy_md_amount',
      width: 100,
      render: (value: number) => (
        <span style={{ color: value > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL }}>
          {value > 0 ? '+' : ''}{(value / 100000000).toFixed(2)}亿
        </span>
      ),
      sorter: (a, b) => a.buy_md_amount - b.buy_md_amount
    },
    {
      title: '小单',
      dataIndex: 'buy_sm_amount',
      key: 'buy_sm_amount',
      width: 100,
      render: (value: number) => (
        <span style={{ color: value > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL }}>
          {value > 0 ? '+' : ''}{(value / 100000000).toFixed(2)}亿
        </span>
      ),
      sorter: (a, b) => a.buy_sm_amount - b.buy_sm_amount
    }
  ];

  // 使用后端返回的统计数据
  const totalNetAmount = summary?.totalNetAmount || 0;
  const totalElgAmount = summary?.totalElgAmount || 0;
  const totalLgAmount = summary?.totalLgAmount || 0;
  const inflowSectors = summary?.inflowSectors || 0;
  const outflowSectors = summary?.outflowSectors || 0;

  return (
    <Card
      title={
        <Space>
          <FundOutlined style={{ color: 'var(--sq-primary)' }} />
          板块资金流向分析
          <Tooltip
            title={
              <div style={{ fontSize: '12px' }}>
                <div><strong>数据说明：</strong></div>
                <div>• 数据来源：东方财富板块资金流向（moneyflow_ind_dc）</div>
                <div>• 超大单：单笔成交 ≥ 100万元（机构大额交易）</div>
                <div>• 大单：单笔成交 50万-100万元（大户交易）</div>
                <div>• 中单：单笔成交 10万-50万元（中户交易）</div>
                <div>• 小单：单笔成交 &lt; 10万元（散户交易）</div>
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #444' }}>
                  <strong>分析要点：</strong><br/>
                  • 主力净流入 = 超大单 + 大单 - 中单 - 小单<br/>
                  • 正值表示资金流入，负值表示资金流出<br/>
                  • 关注主力持续流入的板块
                </div>
              </div>
            }
            placement="right"
          >
            <QuestionCircleOutlined style={{ color: 'var(--sq-primary)', cursor: 'help' }} />
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
      variant="borderless"
      style={{ height: '100%' }}
    >
      {/* 统计概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Statistic
            title="主力净流入"
            value={(totalNetAmount / 100000000).toFixed(2)}
            suffix="亿"
            prefix={totalNetAmount > 0 ? <RiseOutlined /> : <FallOutlined />}
            formatter={(v) => <span className="sq-glitch">{v}</span>}
            valueStyle={{ color: totalNetAmount > 0 ? 'var(--sq-rise)' : 'var(--sq-fall)' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="超大单净流入"
            value={(totalElgAmount / 100000000).toFixed(2)}
            suffix="亿"
            prefix={totalElgAmount > 0 ? <RiseOutlined /> : <FallOutlined />}
            valueStyle={{ color: totalElgAmount > 0 ? 'var(--sq-rise)' : 'var(--sq-fall)' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="大单净流入"
            value={(totalLgAmount / 100000000).toFixed(2)}
            suffix="亿"
            prefix={totalLgAmount > 0 ? <RiseOutlined /> : <FallOutlined />}
            valueStyle={{ color: totalLgAmount > 0 ? 'var(--sq-rise)' : 'var(--sq-fall)' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="流入/流出板块"
            value={`${inflowSectors} / ${outflowSectors}`}
            valueStyle={{ color: 'var(--sq-primary)' }}
          />
        </Col>
      </Row>

      {/* 板块列表 */}
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          pageSizeOptions: ['10', '20', '50']
        }}
        size="small"
        scroll={{ x: 1000, y: 400 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无板块资金流向数据"
            />
          )
        }}
      />
    </Card>
  );
};

// 使用命名导出以保持与项目其他组件的一致性
export const SectorMoneyFlowCard = SectorMoneyFlowCardComponent;
