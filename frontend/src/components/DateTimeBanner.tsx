import React, { useEffect, useMemo, useState } from 'react';
import { CalendarOutlined, ClockCircleOutlined, DownOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

dayjs.locale('zh-cn');

const { Text, Link } = Typography;

const TopBanner: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(dayjs());
  const navigate = useNavigate();
  const { user, doLogout } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const avatarText = useMemo(() => {
    const name = user?.username?.trim() || '';
    return name ? name.slice(0, 1).toUpperCase() : '?';
  }, [user?.username]);

  const menuItems = useMemo(() => {
    const items: Array<{ key: string; label: React.ReactNode }> = [];
    if (!user) return items;
    if (user.isAdmin) items.push({ key: 'user-management', label: '用户管理' });
    items.push({ key: 'logout', label: '退出登录' });
    return items;
  }, [user]);

  return (
    <div
      style={{
        backgroundColor: '#001529',
        color: 'white',
        padding: '0 16px',
        borderBottom: '1px solid #303030',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 48,
        boxSizing: 'border-box',
        fontSize: 13,
      }}
    >
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate('/', { replace: true });
        }}
        style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}
      >
        <Space size={10} align="center">
          <img src="/logo(1).png" alt="logo" style={{ height: 28 }} />
          <Text style={{ color: '#e6f7ff', fontSize: 14, fontWeight: 600 }}>AI智能选股引擎</Text>
        </Space>
      </a>

      <Space size="large" align="center">
        <Space>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          <Text style={{ color: '#e6f7ff' }}>{currentTime.format('YYYY年MM月DD日 dddd')}</Text>
        </Space>
        <Space>
          <ClockCircleOutlined style={{ color: '#faad14' }} />
          <Text style={{ color: '#e6f7ff', fontFamily: 'monospace' }}>{currentTime.format('HH:mm:ss')}</Text>
        </Space>
      </Space>

      {user ? (
        <Dropdown
          menu={{
            items: menuItems,
            onClick: async ({ key }) => {
              if (key === 'user-management') {
                navigate('/user-management');
                return;
              }
              if (key === 'logout') {
                await doLogout();
                navigate('/login', { replace: true });
              }
            },
          }}
          trigger={['click']}
        >
          <a onClick={(e) => e.preventDefault()} style={{ color: '#e6f7ff' }}>
            <Space>
              <Avatar size={28} style={{ backgroundColor: '#1677ff' }}>
                {avatarText}
              </Avatar>
              <Text style={{ color: '#e6f7ff' }}>{user.username}</Text>
              <DownOutlined style={{ fontSize: 12, color: '#e6f7ff' }} />
            </Space>
          </a>
        </Dropdown>
      ) : (
        <Space size={12}>
          <Link onClick={() => navigate('/login')} style={{ color: '#e6f7ff' }}>
            登录
          </Link>
          <Link onClick={() => navigate('/register')} style={{ color: '#e6f7ff' }}>
            注册
          </Link>
        </Space>
      )}
    </div>
  );
};

export default TopBanner;
