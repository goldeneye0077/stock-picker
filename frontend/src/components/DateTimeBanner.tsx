import React, { useState, useEffect } from 'react';
import { ClockCircleOutlined, CalendarOutlined } from '@ant-design/icons';
import { Space, Typography } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

const { Text } = Typography;

const DateTimeBanner: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      backgroundColor: '#001529',
      color: 'white',
      padding: '0 24px',
      textAlign: 'center',
      borderBottom: '1px solid #303030',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '32px',
      boxSizing: 'border-box',
      fontSize: '13px'
    }}>
      <Space size="large">
        <Space>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          <Text style={{ color: '#e6f7ff' }}>{currentTime.format('YYYY年MM月DD日 dddd')}</Text>
        </Space>
        <Space>
          <ClockCircleOutlined style={{ color: '#faad14' }} />
          <Text style={{ color: '#e6f7ff', fontFamily: 'monospace' }}>
            {currentTime.format('HH:mm:ss')}
          </Text>
        </Space>
      </Space>
    </div>
  );
};

export default DateTimeBanner;
