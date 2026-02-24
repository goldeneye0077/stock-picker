import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchMarketSentiment } from '../../services/analysisService';
import { A_SHARE_COLORS } from '../../utils/constants';

export const MarketSentimentCard: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const currentDate = dayjs().format('YYYY-MM-DD');

    useEffect(() => {
        fetchMarketSentiment()
            .then(setData)
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    if (loading || !data) return <Card loading={true} title={`市场情绪 (${currentDate})`} variant="borderless" />;

    const total = data.upCount + data.downCount + data.flatCount;
    const upPercent = total > 0 ? (data.upCount / total) * 100 : 0;
    const downPercent = total > 0 ? (data.downCount / total) * 100 : 0;

    return (
        <Card title={`市场情绪 (${currentDate})`} variant="borderless">
            <Row gutter={[16, 16]}>
                <Col span={8}>
                    <Statistic
                        title="上涨"
                        value={data.upCount}
                        valueStyle={{ color: A_SHARE_COLORS.RISE }}
                        prefix={<ArrowUpOutlined />}
                        suffix={`(${upPercent.toFixed(1)}%)`}
                    />
                </Col>
                <Col span={8}>
                    <Statistic
                        title="下跌"
                        value={data.downCount}
                        valueStyle={{ color: A_SHARE_COLORS.FALL }}
                        prefix={<ArrowDownOutlined />}
                        suffix={`(${downPercent.toFixed(1)}%)`}
                    />
                </Col>
                <Col span={8}>
                    <Statistic
                        title="平盘"
                        value={data.flatCount}
                        prefix={<MinusOutlined />}
                    />
                </Col>
            </Row>
            <div style={{ marginTop: 16, display: 'flex' }}>
                <div style={{ width: `${upPercent}%`, height: 8, background: A_SHARE_COLORS.RISE, borderRadius: '4px 0 0 4px' }} />
                <div style={{ width: `${100 - upPercent - downPercent}%`, height: 8, background: '#d9d9d9' }} />
                <div style={{ width: `${downPercent}%`, height: 8, background: A_SHARE_COLORS.FALL, borderRadius: '0 4px 4px 0' }} />
            </div>
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={12}>
                    <Statistic
                        title="平均涨幅"
                        value={data.avgChange}
                        precision={2}
                        suffix="%"
                        valueStyle={{ color: data.avgChange > 0 ? A_SHARE_COLORS.RISE : (data.avgChange < 0 ? A_SHARE_COLORS.FALL : undefined) }}
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                        title="总成交额"
                        value={data.totalAmount / 100000000}
                        precision={2}
                        suffix="亿"
                    />
                </Col>
            </Row>
        </Card>
    );
};
