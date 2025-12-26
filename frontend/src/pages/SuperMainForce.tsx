import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Space, Statistic, Row, Col, Tag, Button, Typography, DatePicker, Switch, message } from 'antd';
import { ThunderboltOutlined, SyncOutlined } from '@ant-design/icons';
import {
  collectAuctionSnapshot,
  fetchAuctionSuperMainForce,
  type AuctionSuperMainForceItem,
  type AuctionSuperMainForceData
} from '../services/analysisService';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const SuperMainForce: React.FC = () => {
  const [data, setData] = useState<AuctionSuperMainForceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(dayjs().format('YYYY-MM-DD'));
  const [includeAuctionLimitUp, setIncludeAuctionLimitUp] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const first = await fetchAuctionSuperMainForce(20, selectedDate ?? undefined, !includeAuctionLimitUp);
      const effectiveTradeDate = selectedDate ?? first.tradeDate ?? null;

      let result = first;
      const needCollect =
        !!effectiveTradeDate &&
        (result.dataSource === 'none' || (result.items?.length ?? 0) === 0);

      if (needCollect) {
        message.loading({
          content: `${effectiveTradeDate} 数据未准备好，开始从 Tushare 采集...`,
          key: 'super_mainforce_collect',
          duration: 0
        });

        const { inserted } = await collectAuctionSnapshot(effectiveTradeDate);

        message.success({
          content: `采集完成（插入 ${inserted} 条），正在刷新...`,
          key: 'super_mainforce_collect'
        });

        result = await fetchAuctionSuperMainForce(20, effectiveTradeDate, !includeAuctionLimitUp);
      }

      setData(result);
      if (!selectedDate && result.tradeDate) setSelectedDate(result.tradeDate);

      if ((result.items?.length ?? 0) > 0) {
        message.success('集合竞价超强主力数据已刷新');
      } else if (effectiveTradeDate) {
        message.warning(`${effectiveTradeDate} 暂无可展示的集合竞价数据`);
      } else {
        message.warning('暂无可展示的集合竞价数据');
      }
    } catch (error) {
      console.error(error);
      message.error('获取集合竞价超强主力数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, includeAuctionLimitUp]);

  const forceRefresh = useCallback(async () => {
    const effectiveTradeDate = selectedDate ?? dayjs().format('YYYY-MM-DD');
    setLoading(true);
    try {
      message.loading({
        content: `${effectiveTradeDate} 强制从 Tushare 重新采集...`,
        key: 'super_mainforce_force_collect',
        duration: 0
      });

      const { inserted } = await collectAuctionSnapshot(effectiveTradeDate, undefined, true);

      message.success({
        content: `强制采集完成（插入 ${inserted} 条），正在刷新...`,
        key: 'super_mainforce_force_collect'
      });

      const result = await fetchAuctionSuperMainForce(20, effectiveTradeDate, !includeAuctionLimitUp);
      setData(result);
      setSelectedDate(effectiveTradeDate);

      if ((result.items?.length ?? 0) > 0) {
        message.success('集合竞价超强主力数据已刷新');
      } else {
        message.warning(`${effectiveTradeDate} 暂无可展示的集合竞价数据`);
      }
    } catch (error) {
      console.error(error);
      message.error('强制刷新失败');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, includeAuctionLimitUp]);

  const handleDateChange = (date: Dayjs | null, dateString: string) => {
    if (date) {
      setSelectedDate(dateString);
    } else {
      setSelectedDate(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const columns: ColumnsType<AuctionSuperMainForceItem> = [
    {
      title: '序号',
      dataIndex: 'rank',
      key: 'rank',
      width: 70
    },
    {
      title: '股票',
      dataIndex: 'stock',
      key: 'stock',
      width: 130,
      render: (text: string, record: AuctionSuperMainForceItem) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 'bold' }}>{text}</span>
          <span style={{ fontSize: 12, color: '#888' }}>{record.name}</span>
        </Space>
      )
    },
    {
      title: '竞价热度',
      dataIndex: 'heatScore',
      key: 'heatScore',
      width: 120,
      sorter: (a, b) => a.heatScore - b.heatScore,
      render: (val: number, record: AuctionSuperMainForceItem) => (
        <Space>
          <span>{val.toFixed(1)}</span>
          {record.auctionLimitUp && <Tag color="gold">竞价涨停</Tag>}
          {record.likelyLimitUp && <Tag color="red">冲板优选</Tag>}
        </Space>
      )
    },
    {
      title: '竞价涨幅',
      dataIndex: 'gapPercent',
      key: 'gapPercent',
      width: 110,
      sorter: (a, b) => a.gapPercent - b.gapPercent,
      render: (val: number) => {
        const color = val >= 0 ? '#cf1322' : '#3f8600';
        return <span style={{ color }}>{val.toFixed(2)}%</span>;
      }
    },
    {
      title: '量比',
      dataIndex: 'volumeRatio',
      key: 'volumeRatio',
      width: 100,
      sorter: (a, b) => a.volumeRatio - b.volumeRatio,
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      key: 'turnoverRate',
      width: 110,
      sorter: (a, b) => a.turnoverRate - b.turnoverRate,
      render: (val: number) => `${val.toFixed(2)}%`
    },
    {
      title: '竞价金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      sorter: (a, b) => a.amount - b.amount,
      render: (val: number) => `${(val / 1e8).toFixed(2)}亿`
    },
    {
      title: '竞价均价',
      dataIndex: 'price',
      key: 'price',
      width: 110,
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '昨收',
      dataIndex: 'preClose',
      key: 'preClose',
      width: 110,
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 150,
      ellipsis: true
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <ThunderboltOutlined />
            <span style={{ fontSize: 16, fontWeight: 'bold' }}>超强主力 · 集合竞价龙虎榜</span>
          </Space>
        }
        extra={
          <Space>
            <DatePicker
              size="small"
              value={selectedDate ? dayjs(selectedDate) : null}
              onChange={(date, dateString) =>
                handleDateChange(
                  date as Dayjs | null,
                  Array.isArray(dateString) ? (dateString[0] ?? '') : dateString
                )
              }
              allowClear
              format="YYYY-MM-DD"
              disabled={loading}
            />
            <Space size={4}>
              <span style={{ fontSize: 12, color: '#aaa' }}>含竞价涨停</span>
              <Switch
                size="small"
                checked={includeAuctionLimitUp}
                onChange={setIncludeAuctionLimitUp}
                disabled={loading}
              />
            </Space>
            <Button icon={<SyncOutlined spin={loading} />} onClick={loadData} loading={loading} size="small">
              刷新
            </Button>
            <Button onClick={forceRefresh} disabled={loading} size="small">
              强制刷新
            </Button>
          </Space>
        }
      >
        <Row gutter={24}>
          <Col xs={24} md={16}>
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              竞价热度算法说明：综合集合竞价期间数据计算热度评分，权重分配为：
              <span style={{ color: '#fadb14' }}>量比(40%)、换手率(20%)、涨幅(30%)、竞价金额(10%)</span>
              ，评分越高代表主力资金关注度越高。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13, color: '#aaa' }}>
              算法公式：热度评分 = (量比得分×40% + 换手得分×20% + 涨幅得分×30% + 金额得分×10%)×100（各项得分做归一化/对数缩放并裁剪到 0~1）
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={8}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="候选标的数量"
                  value={data?.summary.count || 0}
                  suffix="只"
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="冲板优选"
                  value={data?.summary.limitUpCandidates || 0}
                  suffix="只"
                  valueStyle={{ color: '#cf1322' }}
                />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Statistic
                  title="平均竞价热度"
                  value={data?.summary.avgHeat || 0}
                  precision={1}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="总竞价金额"
                  value={(data?.summary.totalAmount || 0) / 1e8}
                  precision={2}
                  suffix="亿"
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          loading={loading}
          columns={columns}
          dataSource={data?.items || []}
          rowKey={(record) => `${record.stock}-${record.rank}`}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default SuperMainForce;
