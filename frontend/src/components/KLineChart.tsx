import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Spin } from 'antd';

interface KLineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface KLineChartProps {
  data: KLineData[];
  loading?: boolean;
  height?: number;
}

const KLineChart: React.FC<KLineChartProps> = ({ data, loading = false, height = 400 }) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {};
    }

    // 按日期排序
    const sortedData = [...data].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const dates = sortedData.map(item => item.date);
    const klineData = sortedData.map(item => [
      item.open,
      item.close,
      item.low,
      item.high
    ]);
    const volumes = sortedData.map(item => item.volume);

    // 计算MA5, MA10, MA20
    const calculateMA = (dayCount: number) => {
      const result = [];
      for (let i = 0; i < sortedData.length; i++) {
        if (i < dayCount - 1) {
          result.push('-');
          continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) {
          sum += sortedData[i - j].close;
        }
        result.push((sum / dayCount).toFixed(2));
      }
      return result;
    };

    return {
      backgroundColor: '#1f1f1f',
      animation: true,
      legend: {
        data: ['K线', 'MA5', 'MA10', 'MA20'],
        textStyle: { color: '#ffffff' },
        top: 10
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        backgroundColor: 'rgba(31, 31, 31, 0.9)',
        borderColor: '#434343',
        textStyle: { color: '#ffffff' }
      },
      grid: [
        {
          left: '10%',
          right: '10%',
          top: '15%',
          height: '50%'
        },
        {
          left: '10%',
          right: '10%',
          top: '70%',
          height: '15%'
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          scale: true,
          boundaryGap: true,
          axisLine: { lineStyle: { color: '#434343' } },
          axisLabel: { color: '#999999' },
          splitLine: { show: false },
          splitNumber: 20,
          min: 'dataMin',
          max: 'dataMax'
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          scale: true,
          boundaryGap: true,
          axisLine: { lineStyle: { color: '#434343' } },
          axisLabel: { show: false },
          splitLine: { show: false },
          splitNumber: 20,
          min: 'dataMin',
          max: 'dataMax'
        }
      ],
      yAxis: [
        {
          scale: true,
          splitArea: {
            show: false
          },
          axisLine: { lineStyle: { color: '#434343' } },
          axisLabel: { color: '#999999' },
          splitLine: { lineStyle: { color: '#434343' } }
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 50,
          end: 100
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          top: '90%',
          start: 50,
          end: 100,
          textStyle: { color: '#ffffff' },
          borderColor: '#434343',
          fillerColor: 'rgba(24, 144, 255, 0.2)',
          handleStyle: { color: '#1890ff' }
        }
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: klineData,
          itemStyle: {
            color: '#ef5350',
            color0: '#26a69a',
            borderColor: '#ef5350',
            borderColor0: '#26a69a'
          }
        },
        {
          name: 'MA5',
          type: 'line',
          data: calculateMA(5),
          smooth: true,
          lineStyle: { width: 1, color: '#ffeb3b' },
          showSymbol: false
        },
        {
          name: 'MA10',
          type: 'line',
          data: calculateMA(10),
          smooth: true,
          lineStyle: { width: 1, color: '#ff9800' },
          showSymbol: false
        },
        {
          name: 'MA20',
          type: 'line',
          data: calculateMA(20),
          smooth: true,
          lineStyle: { width: 1, color: '#9c27b0' },
          showSymbol: false
        },
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          itemStyle: {
            color: (params: any) => {
              const dataIndex = params.dataIndex;
              return klineData[dataIndex][1] >= klineData[dataIndex][0]
                ? 'rgba(239, 83, 80, 0.5)'
                : 'rgba(38, 166, 154, 0.5)';
            }
          }
        }
      ]
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
        暂无K线数据
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: `${height}px`, width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};

export default KLineChart;
