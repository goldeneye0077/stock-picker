import React from 'react';
import { Space, Typography } from 'antd';
import { FigmaColors, FigmaBorderRadius } from '../styles/FigmaDesignTokens';

const { Title, Text } = Typography;

type FigmaPageHeroProps = {
  icon: React.ReactNode;
  title: React.ReactNode;
  subTitle?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: { text: string; status: 'success' | 'warning' | 'error' };
};

const FigmaPageHero: React.FC<FigmaPageHeroProps> = ({ icon, title, subTitle, actions, badge }) => {
  const badgeColors = {
    success: { bg: `rgba(0, 245, 160, 0.1)`, text: FigmaColors.success },
    warning: { bg: `rgba(255, 176, 32, 0.1)`, text: FigmaColors.warning },
    error: { bg: `rgba(255, 55, 95, 0.1)`, text: FigmaColors.error },
  };

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
            color: FigmaColors.text,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Title level={3} style={{ margin: 0, color: FigmaColors.text, lineHeight: '28px', fontSize: 20 }}>
              {title}
            </Title>
            {badge && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: FigmaBorderRadius.full,
                  fontSize: 12,
                  fontWeight: 500,
                  background: badgeColors[badge.status].bg,
                  color: badgeColors[badge.status].text,
                  whiteSpace: 'nowrap',
                }}
              >
                {badge.text}
              </span>
            )}
          </div>
          {subTitle ? (
            <Text style={{ color: FigmaColors.textSecondary, fontSize: 14, lineHeight: '20px' }}>
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
