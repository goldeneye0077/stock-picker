import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { CopyOutlined, LineChartOutlined, PlusOutlined } from '@ant-design/icons';
import { useStockDetail } from '../hooks/useStockList';
import { fetchStockHistory } from '../services/stockService';
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

  useEffect(() => {
    if (!open || !stockCode) return;
    fetchDetail(stockCode);
    fetchAnalysisData(stockCode, { date: analysisDate ?? undefined });
  }, [analysisDate, fetchAnalysisData, fetchDetail, open, stockCode]);

  useEffect(() => {
    if (!open || !stockCode) return;
    let cancelled = false;
    setKlineError(null);
    fetchStockHistory(stockCode, { period: 'daily' })
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
  const currentPrice = detail?.realtimeQuote?.close ?? detail?.stock?.current_price;
  const changePercent = detail?.realtimeQuote?.change_percent ?? detail?.stock?.change_percent;

  const priceText = useMemo(() => {
    const p = Number(currentPrice);
    if (!Number.isFinite(p)) return '-';
    return p.toFixed(2);
  }, [currentPrice]);

  const changeText = useMemo(() => {
    const cp = Number(changePercent);
    if (!Number.isFinite(cp)) return null;
    const prefix = cp > 0 ? '+' : '';
    return `${prefix}${cp.toFixed(2)}%`;
  }, [changePercent]);

  const changeClass = useMemo(() => {
    const cp = Number(changePercent);
    if (!Number.isFinite(cp)) return 'sq-neutral';
    if (cp > 0) return 'sq-rise';
    if (cp < 0) return 'sq-fall';
    return 'sq-neutral';
  }, [changePercent]);

  const signalSummary = useMemo(() => computeSignals({ price: Number(currentPrice), indicators: analysis?.indicators }), [analysis?.indicators, currentPrice]);

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
          <Button size="small" icon={<PlusOutlined />}>
            加入观察
          </Button>
        </Space>
      </Space>
      <Space size={12}>
        <Text className="sq-mono" style={{ fontSize: 16, fontWeight: 650 }}>{priceText}</Text>
        {changeText ? (
          <Text className={`${changeClass} sq-mono`} style={{ fontSize: 14, fontWeight: 650 }}>
            {changeText}
          </Text>
        ) : (
          <Text style={{ color: 'var(--sq-text-tertiary)' }}>-</Text>
        )}
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

