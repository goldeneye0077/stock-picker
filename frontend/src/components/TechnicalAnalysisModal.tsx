import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Button, Descriptions, Modal, Space, Tabs, Tag, Typography, Statistic, Row, Col, Spin } from 'antd';
import { CopyOutlined, LineChartOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useStockDetail } from '../hooks/useStockList';
import { fetchStockHistoryForRealtime, fetchRealtimeQuote } from '../services/stockService';
import KLineChart from './KLineChart';

const { Text, Title } = Typography;

type TechnicalAnalysisModalProps = {
  open: boolean;
  onClose: () => void;
  stockCode?: string | null;
  stockName?: string | null;
  analysisDate?: string | null;
  tags?: Array<{ label: string; color?: string }>;
};

function formatNumber(val: any, digits: number = 2) {
  const n = Number(val);
  if (Number.isFinite(n)) return n.toFixed(digits);
  return '-';
}

function computeSignals(input: { price?: number; indicators?: any }) {
  const price = Number(input.price);
  const ind = input.indicators || {};
  const ma5 = Number(ind.ma5);
  const ma10 = Number(ind.ma10);
  const ma20 = Number(ind.ma20);
  const rsi6 = Number(ind.rsi6);
  const macd = Number(ind.macd);
  const macdSignal = Number(ind.macdSignal);

  const hasPrice = Number.isFinite(price) && price > 0;
  const hasMa = Number.isFinite(ma5) && Number.isFinite(ma10) && Number.isFinite(ma20);
  const hasRsi = Number.isFinite(rsi6);
  const hasMacd = Number.isFinite(macd) && Number.isFinite(macdSignal);

  const signals: Array<{ title: string; level: 'strong' | 'neutral' | 'weak'; detail: string }> = [];

  if (hasMa && hasPrice) {
    const bullish = ma5 >= ma10 && ma10 >= ma20 && price >= ma20;
    const bearish = ma5 <= ma10 && ma10 <= ma20 && price <= ma20;
    if (bullish) {
      signals.push({ title: '均线结构', level: 'strong', detail: 'MA5 ≥ MA10 ≥ MA20，且价格位于 MA20 上方' });
    } else if (bearish) {
      signals.push({ title: '均线结构', level: 'weak', detail: 'MA5 ≤ MA10 ≤ MA20，且价格位于 MA20 下方' });
    } else {
      signals.push({ title: '均线结构', level: 'neutral', detail: '均线分歧或价格处于均线附近，趋势未充分确认' });
    }
  }

  if (hasRsi) {
    if (rsi6 >= 80) signals.push({ title: 'RSI(6)', level: 'weak', detail: '超买风险偏高（≥80）' });
    else if (rsi6 <= 20) signals.push({ title: 'RSI(6)', level: 'strong', detail: '超卖回弹概率提升（≤20）' });
    else signals.push({ title: 'RSI(6)', level: 'neutral', detail: '区间正常（20-80）' });
  }

  if (hasMacd) {
    if (macd >= macdSignal) signals.push({ title: 'MACD', level: 'strong', detail: 'DIF 位于 DEA 上方，偏多' });
    else signals.push({ title: 'MACD', level: 'weak', detail: 'DIF 位于 DEA 下方，偏空' });
  }

  const score =
    signals.reduce((acc, s) => acc + (s.level === 'strong' ? 1 : s.level === 'weak' ? -1 : 0), 0) / Math.max(1, signals.length);
  const verdict = score >= 0.34 ? '偏强' : score <= -0.34 ? '偏弱' : '中性';

  return { verdict, signals };
}

export default function TechnicalAnalysisModal({
  open,
  onClose,
  stockCode,
  stockName,
  analysisDate,
  tags,
}: TechnicalAnalysisModalProps) {
  const { detail, analysis, loading, fetchDetail, fetchAnalysisData, reset } = useStockDetail();
  const [klineData, setKlineData] = useState<any[]>([]);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [realtimeData, setRealtimeData] = useState<any>(null);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  // 获取实时行情数据
  const fetchRealtimeData = useCallback(async () => {
    if (!stockCode) return;
    setRealtimeLoading(true);
    setRealtimeError(null);
    try {
      const tsCode = stockCode.includes('.') ? stockCode : `${stockCode}.SZ`;
      const data = await fetchRealtimeQuote(tsCode);
      setRealtimeData(data);
    } catch (err) {
      setRealtimeError('实时行情加载失败');
      console.error('获取实时行情失败:', err);
    } finally {
      setRealtimeLoading(false);
    }
  }, [stockCode]);

  useEffect(() => {
    if (!open || !stockCode) return;
    fetchDetail(stockCode);
    fetchAnalysisData(stockCode, { date: analysisDate ?? undefined });
    fetchRealtimeData();
  }, [analysisDate, fetchAnalysisData, fetchDetail, open, stockCode]);

  // 5秒自动刷新实时行情
  useEffect(() => {
    if (!open || !stockCode) return;

    const timer = setInterval(() => {
      fetchRealtimeData();
    }, 5000); // 5秒刷新

    return () => {
      clearInterval(timer);
    };
  }, [open, stockCode, fetchRealtimeData]);

  useEffect(() => {
    if (!open || !stockCode) return;
    let cancelled = false;
    setKlineError(null);
    // 使用1年历史数据
    fetchStockHistoryForRealtime(stockCode)
      .then((res) => {
        if (cancelled) return;
        setKlineData(res?.klines || []);
      })
      .catch(() => {
        if (cancelled) return;
        setKlineData([]);
        setKlineError('K线数据加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [open, stockCode]);

  const resolvedCode = stockCode || '-';
  const resolvedName = stockName || detail?.stock?.name || '-';
  
  // 使用实时行情数据，如果没有则使用详情数据
  const currentPrice = realtimeData?.close ?? detail?.realtimeQuote?.close ?? detail?.stock?.current_price;
  const changePercent = realtimeData?.change_percent ?? detail?.realtimeQuote?.change_percent ?? detail?.stock?.change_percent;
  const changeAmount = realtimeData?.change_amount ?? 0;
  const openPrice = realtimeData?.open ?? 0;
  const highPrice = realtimeData?.high ?? 0;
  const lowPrice = realtimeData?.low ?? 0;
  const volume = realtimeData?.vol ?? 0;
  const amount = realtimeData?.amount ?? 0;
  const updatedAt = realtimeData?.updated_at ?? null;

  const priceText = useMemo(() => {
    const p = Number(currentPrice);
    if (!Number.isFinite(p)) return '-';
    return p.toFixed(2);
  }, [currentPrice]);

  const changeText = useMemo(() => {
    const cp = Number(changePercent);
    if (!Number.isFinite(cp)) return undefined;
    const prefix = cp > 0 ? '+' : '';
    return `${prefix}${cp.toFixed(2)}%`;
  }, [changePercent]);

  const changeAmountText = useMemo(() => {
    const ca = Number(changeAmount);
    if (!Number.isFinite(ca)) return undefined;
    const prefix = ca > 0 ? '+' : '';
    return `${prefix}${ca.toFixed(2)}`;
  }, [changeAmount]);

  const changeClass = useMemo(() => {
    const cp = Number(changePercent);
    if (!Number.isFinite(cp)) return 'sq-neutral';
    if (cp > 0) return 'sq-rise';
    if (cp < 0) return 'sq-fall';
    return 'sq-neutral';
  }, [changePercent]);

  const signalSummary = useMemo(() => computeSignals({ price: Number(currentPrice), indicators: analysis?.indicators }), [analysis?.indicators, currentPrice]);

  // 格式化成交量
  const volumeText = useMemo(() => {
    if (!volume) return '-';
    if (volume >= 100000000) return `${(volume / 100000000).toFixed(2)}亿`;
    if (volume >= 10000) return `${(volume / 10000).toFixed(2)}万`;
    return volume.toString();
  }, [volume]);

  // 格式化成交额
  const amountText = useMemo(() => {
    if (!amount) return '-';
    if (amount >= 100000000) return `${(amount / 100000000).toFixed(2)}亿`;
    if (amount >= 10000) return `${(amount / 10000).toFixed(2)}万`;
    return amount.toString();
  }, [amount]);

  const header = (
    <Space direction="vertical" size={2} style={{ width: '100%' }}>
      <Space align="baseline" size={10} style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space align="baseline" size={10}>
          <Title level={4} style={{ margin: 0 }}>
            {resolvedName}
          </Title>
          <Text className="sq-mono" style={{ color: 'var(--sq-text-tertiary)' }}>
            {resolvedCode}
          </Text>
          {tags?.length ? (
            <Space size={6}>
              {tags.slice(0, 3).map((t) => (
                <Tag key={t.label} color={t.color}>{t.label}</Tag>
              ))}
            </Space>
          ) : null}
        </Space>
        <Space size={10}>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={async () => {
              await navigator.clipboard.writeText(resolvedCode);
            }}
          >
            复制代码
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchRealtimeData} loading={realtimeLoading}>
            刷新行情
          </Button>
          <Button size="small" icon={<PlusOutlined />}>
            加入观察
          </Button>
        </Space>
      </Space>
      
      {/* 实时行情区域 */}
      <Row gutter={16} style={{ marginTop: 8, padding: '12px', background: 'var(--sq-bg-secondary)', borderRadius: 8 }}>
        <Col span={4}>
          <Statistic 
            title="当前价" 
            value={priceText} 
            precision={2} 
            valueStyle={{ color: changePercent > 0 ? '#cf1322' : changePercent < 0 ? '#3f8600' : '#666', fontSize: 20, fontWeight: 650 }}
            suffix="元"
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="涨跌额" 
            value={changeAmountText} 
            precision={2} 
            valueStyle={{ color: changeAmount > 0 ? '#cf1322' : changeAmount < 0 ? '#3f8600' : '#666', fontSize: 16 }}
            suffix="元"
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="涨跌幅" 
            value={changeText} 
            valueStyle={{ color: changePercent > 0 ? '#cf1322' : changePercent < 0 ? '#3f8600' : '#666', fontSize: 16 }}
          />
        </Col>
        <Col span={3}>
          <div style={{ fontSize: 12, color: 'var(--sq-text-tertiary)' }}>今开</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{openPrice > 0 ? openPrice.toFixed(2) : '-'}</div>
        </Col>
        <Col span={3}>
          <div style={{ fontSize: 12, color: 'var(--sq-text-tertiary)' }}>最高</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#cf1322' }}>{highPrice > 0 ? highPrice.toFixed(2) : '-'}</div>
        </Col>
        <Col span={3}>
          <div style={{ fontSize: 12, color: 'var(--sq-text-tertiary)' }}>最低</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#3f8600' }}>{lowPrice > 0 ? lowPrice.toFixed(2) : '-'}</div>
        </Col>
        <Col span={3}>
          <div style={{ fontSize: 12, color: 'var(--sq-text-tertiary)' }}>成交量</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{volumeText}</div>
        </Col>
      </Row>
      
      {realtimeError && (
        <Alert type="warning" message={realtimeError} showIcon style={{ marginTop: 8 }} />
      )}
      
      {updatedAt && (
        <div style={{ fontSize: 12, color: 'var(--sq-text-tertiary)', marginTop: 4 }}>
          更新时间: {new Date(updatedAt).toLocaleString('zh-CN')}
        </div>
      )}
      
      <Space size={12} style={{ marginTop: 8 }}>
        <Text style={{ color: 'var(--sq-text-tertiary)' }}>综合判断：{signalSummary.verdict}</Text>
      </Space>
    </Space>
  );

  return (
    <Modal
      title={header}
      open={open}
      onCancel={() => {
        onClose();
        setKlineData([]);
        setKlineError(null);
        reset();
      }}
      footer={null}
      width={1200}
      destroyOnClose
      styles={{ body: { paddingTop: 12 } }}
    >
      <Tabs
        defaultActiveKey="chart"
        items={[
          {
            key: 'chart',
            label: (
              <Space size={8}>
                <LineChartOutlined />
                <span>图表与指标</span>
              </Space>
            ),
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {klineError ? <Alert type="error" message={klineError} showIcon /> : null}
                {klineData.length > 0 ? (
                  <KLineChart data={klineData} />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--sq-text-tertiary)' }}>
                    {loading ? '数据加载中...' : '暂无K线数据'}
                  </div>
                )}

                {analysis?.indicators ? (
                  <Descriptions bordered size="small" column={4}>
                    <Descriptions.Item label="MA5">{formatNumber(analysis.indicators.ma5)}</Descriptions.Item>
                    <Descriptions.Item label="MA10">{formatNumber(analysis.indicators.ma10)}</Descriptions.Item>
                    <Descriptions.Item label="MA20">{formatNumber(analysis.indicators.ma20)}</Descriptions.Item>
                    <Descriptions.Item label="MA60">{formatNumber(analysis.indicators.ma60)}</Descriptions.Item>
                    <Descriptions.Item label="RSI(6)">{formatNumber(analysis.indicators.rsi6)}</Descriptions.Item>
                    <Descriptions.Item label="RSI(12)">{formatNumber(analysis.indicators.rsi12)}</Descriptions.Item>
                    <Descriptions.Item label="MACD">{formatNumber(analysis.indicators.macd)}</Descriptions.Item>
                    <Descriptions.Item label="MACD Signal">{formatNumber(analysis.indicators.macdSignal)}</Descriptions.Item>
                    <Descriptions.Item label="BOLL 上轨">{formatNumber(analysis.indicators.bollUpper)}</Descriptions.Item>
                    <Descriptions.Item label="BOLL 中轨">{formatNumber(analysis.indicators.bollMiddle)}</Descriptions.Item>
                    <Descriptions.Item label="BOLL 下轨">{formatNumber(analysis.indicators.bollLower)}</Descriptions.Item>
                    <Descriptions.Item label="量比">{formatNumber(analysis.indicators.volumeRatio)}</Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Alert type="info" message={loading ? '技术指标计算中...' : '暂无技术指标'} showIcon />
                )}
              </Space>
            ),
          },
          {
            key: 'signals',
            label: '关键信号',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type={signalSummary.verdict === '偏强' ? 'success' : signalSummary.verdict === '偏弱' ? 'warning' : 'info'}
                  showIcon
                  message={`综合判断：${signalSummary.verdict}`}
                  description="结论基于历史指标规则化推断，仅供参考，不构成投资建议。"
                />
                <Descriptions bordered size="small" column={1} labelStyle={{ width: 140 }}>
                  {signalSummary.signals.map((s) => (
                    <Descriptions.Item
                      key={s.title}
                      label={
                        <Space size={8}>
                          <span>{s.title}</span>
                          <Tag
                            color={s.level === 'strong' ? 'green' : s.level === 'weak' ? 'gold' : 'default'}
                            style={{ marginInlineEnd: 0 }}
                          >
                            {s.level === 'strong' ? '偏多' : s.level === 'weak' ? '偏空/风险' : '中性'}
                          </Tag>
                        </Space>
                      }
                    >
                      {s.detail}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Space>
            ),
          },
          {
            key: 'profile',
            label: '题材与资金',
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {tags?.length ? (
                  <Space wrap size={8}>
                    {tags.map((t) => (
                      <Tag key={t.label} color={t.color}>{t.label}</Tag>
                    ))}
                  </Space>
                ) : (
                  <Alert type="info" message="暂无题材/行业标签" showIcon />
                )}
                <Alert type="info" message="资金与事件简报待接入（占位）" showIcon />
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
}

