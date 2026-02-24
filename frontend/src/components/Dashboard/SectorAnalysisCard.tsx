import React, { useEffect, useState } from 'react';
import { Card, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { fetchSectorAnalysis } from '../../services/analysisService';
import { A_SHARE_COLORS } from '../../utils/constants';

export const SectorAnalysisCard: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [dataDate, setDataDate] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSectorAnalysis()
            .then((result: any) => {
                // Handle both old and new response formats
                if (result.data && Array.isArray(result.data)) {
                    setData(result.data);
                    setDataDate(result.data_date || 'Realtime');
                } else {
                    setData(result); // Old format
                    setDataDate(dayjs().format('YYYY-MM-DD'));
                }
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const displayDate = dataDate === 'Realtime' ? dayjs().format('YYYY-MM-DD') : dataDate;

    const columns = [
        { title: '板块', dataIndex: 'industry', key: 'industry' },
        {
            title: '平均涨幅',
            dataIndex: 'avgChange',
            key: 'avgChange',
            render: (val: number) => (
                <span style={{ color: val > 0 ? A_SHARE_COLORS.RISE : (val < 0 ? A_SHARE_COLORS.FALL : undefined) }}>
                    {val ? val.toFixed(2) : '0.00'}%
                </span>
            ),
            sorter: (a: any, b: any) => a.avgChange - b.avgChange,
        },
        {
            title: '主力净流入',
            dataIndex: 'netMainFlow',
            key: 'netMainFlow',
            render: (val: number) => (
                <span style={{ color: val > 0 ? A_SHARE_COLORS.RISE : (val < 0 ? A_SHARE_COLORS.FALL : undefined) }}>
                    {val ? (val / 100000000).toFixed(2) : '0.00'}亿
                </span>
            ),
            sorter: (a: any, b: any) => a.netMainFlow - b.netMainFlow,
        },
        {
            title: '领涨股',
            key: 'leader',
            render: (_: any, record: any) => (
                <span>
                    {record.leaderName}
                    {record.leaderChange !== undefined && (
                        <Tag color={record.leaderChange > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL} style={{ marginLeft: 8 }}>
                            {record.leaderChange.toFixed(2)}%
                        </Tag>
                    )}
                </span>
            )
        }
    ];

    return (
        <Card title={`板块分析 (${displayDate})`} variant="borderless">
            <Table
                dataSource={data}
                columns={columns}
                rowKey="industry"
                pagination={{ pageSize: 5 }}
                size="small"
                loading={loading}
            />
        </Card>
    );
};
