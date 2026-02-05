import React from 'react';
import { Space, Typography } from 'antd';

const { Title, Text } = Typography;

type FigmaPageHeroProps = {
  icon: React.ReactNode;
  title: React.ReactNode;
  subTitle?: React.ReactNode;
  actions?: React.ReactNode;
};

const FigmaPageHero: React.FC<FigmaPageHeroProps> = ({ icon, title, subTitle, actions }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 24,
      }}
    >
      <Space size={12} align="center">
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F1F5F9',
            background: 'linear-gradient(135deg, rgba(49, 65, 88, 1) 0%, rgba(29, 41, 61, 1) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow:
              '0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)',
            flex: '0 0 auto',
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <Title level={3} style={{ margin: 0, color: '#F1F5F9', lineHeight: '28px', fontSize: 20 }}>
            {title}
          </Title>
          {subTitle ? (
            <Text style={{ color: '#90A1B9', fontSize: 14, lineHeight: '20px' }}>
              {subTitle}
            </Text>
          ) : null}
        </div>
      </Space>

      {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div> : null}
    </div>
  );
};

export default FigmaPageHero;
