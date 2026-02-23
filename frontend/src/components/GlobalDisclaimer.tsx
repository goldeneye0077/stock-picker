import React from 'react';
import { Space, Typography } from 'antd';
import { Link } from 'react-router-dom';

const { Text } = Typography;

const GlobalDisclaimer: React.FC = () => {
  return (
    <footer
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1001,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        boxSizing: 'border-box',
        borderTop: '1px solid var(--sq-border)',
        background: 'color-mix(in srgb, var(--sq-bg) 90%, transparent 10%)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Space size={12} wrap style={{ justifyContent: 'center' }}>
        <Text style={{ color: 'var(--sq-text-secondary)', fontSize: 12, textAlign: 'center' }}>
          本网站属于学习交流性质，不构成任何投资建议。市场有风险，投资需谨慎。
        </Text>
        <Link to="/contact" style={{ fontSize: 12 }}>
          联系我
        </Link>
        <Link to="/user-agreement" style={{ fontSize: 12 }}>
          用户协议
        </Link>
        <Link to="/privacy-policy" style={{ fontSize: 12 }}>
          隐私政策
        </Link>
      </Space>
    </footer>
  );
};

export default GlobalDisclaimer;
