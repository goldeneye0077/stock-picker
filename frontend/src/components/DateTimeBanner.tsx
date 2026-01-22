import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellOutlined, CalendarOutlined, ClockCircleOutlined, DownOutlined, SearchOutlined } from '@ant-design/icons';
import { AutoComplete, Avatar, Badge, Dropdown, Input, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchStocks } from '../services/stockService';

dayjs.locale('zh-cn');

const { Text, Link } = Typography;

type TopBannerProps = {
  themeMode: 'dark' | 'light';
  onToggleThemeMode: () => void;
  routeLabels: Record<string, string>;
};

const TopBanner: React.FC<TopBannerProps> = ({ themeMode, onToggleThemeMode, routeLabels }) => {
  const [currentTime, setCurrentTime] = useState(dayjs());
  const navigate = useNavigate();
  const location = useLocation();
  const { user, doLogout } = useAuth();
  const [searchValue, setSearchValue] = useState('');
  const [searchOptions, setSearchOptions] = useState<Array<{ value: string; label: React.ReactNode }>>([]);
  const searchTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<any>(null);

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
    items.push({
      key: 'toggle-theme',
      label: themeMode === 'dark' ? '切换到亮色模式' : '切换到深色模式',
    });
    items.push({ key: 'logout', label: '退出登录' });
    return items;
  }, [themeMode, user]);

  const breadcrumbItems = useMemo(() => {
    const pathname = location.pathname;
    const directLabel = routeLabels[pathname];
    if (directLabel) return ['首页', directLabel].filter(Boolean);

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return ['首页'];

    const crumbs: string[] = ['首页'];
    let current = '';
    for (const seg of segments) {
      current += `/${seg}`;
      const label = routeLabels[current];
      if (label) crumbs.push(label);
    }
    return crumbs;
  }, [location.pathname, routeLabels]);

  const getMarketStatus = useCallback((now: dayjs.Dayjs) => {
    const day = now.day();
    const isWeekday = day >= 1 && day <= 5;
    if (!isWeekday) {
      return { label: '休盘', color: 'default' as const, countdown: '距离开盘：--:--:--' };
    }

    const today = now.format('YYYY-MM-DD');
    const t0930 = dayjs(`${today} 09:30:00`);
    const t1130 = dayjs(`${today} 11:30:00`);
    const t1300 = dayjs(`${today} 13:00:00`);
    const t1500 = dayjs(`${today} 15:00:00`);

    const fmt = (diffMs: number) => {
      const total = Math.max(0, Math.floor(diffMs / 1000));
      const h = String(Math.floor(total / 3600)).padStart(2, '0');
      const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const s = String(total % 60).padStart(2, '0');
      return `${h}:${m}:${s}`;
    };

    if (now.isBefore(t0930)) {
      return { label: '休盘', color: 'default' as const, countdown: `距离开盘：${fmt(t0930.diff(now))}` };
    }
    if (now.isBefore(t1130)) {
      return { label: '交易中', color: 'processing' as const, countdown: `距离午休：${fmt(t1130.diff(now))}` };
    }
    if (now.isBefore(t1300)) {
      return { label: '休盘', color: 'default' as const, countdown: `距离开盘：${fmt(t1300.diff(now))}` };
    }
    if (now.isBefore(t1500)) {
      return { label: '交易中', color: 'processing' as const, countdown: `距离收盘：${fmt(t1500.diff(now))}` };
    }

    return { label: '休盘', color: 'default' as const, countdown: '已收盘' };
  }, []);

  const marketStatus = useMemo(() => getMarketStatus(currentTime), [currentTime, getMarketStatus]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const hit = (isMac ? e.metaKey : e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (!hit) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const buildSearchOptions = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setSearchOptions([]);
      return;
    }

    try {
      const [stocks] = await Promise.all([
        searchStocks(q),
      ]);

      const stockOptions = (stocks || []).slice(0, 8).map((s: any) => ({
        value: s.code,
        label: (
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size={8}>
              <Text className="sq-mono" style={{ color: 'inherit' }}>{s.code}</Text>
              <Text style={{ color: 'inherit' }}>{s.name}</Text>
            </Space>
            <Text type="secondary">股票</Text>
          </Space>
        ),
      }));

      const featureOptions = [
        { path: '/super-main-force', name: '超强主力' },
        { path: '/smart-selection', name: '精算智选' },
        { path: '/stocks', name: '股票列表' },
        { path: '/settings', name: '设置' },
        ...(user?.isAdmin ? [{ path: '/user-management', name: '用户管理' }] : []),
      ]
        .filter((x) => x.name.includes(q) || x.path.includes(q))
        .slice(0, 5)
        .map((x) => ({
          value: x.path,
          label: (
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text style={{ color: 'inherit' }}>{x.name}</Text>
              <Text type="secondary">功能</Text>
            </Space>
          ),
        }));

      setSearchOptions([...stockOptions, ...featureOptions]);
    } catch {
      setSearchOptions([]);
    }
  }, [user?.isAdmin]);

  const onSearchChange = useCallback((val: string) => {
    setSearchValue(val);
    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      buildSearchOptions(val);
    }, 200);
  }, [buildSearchOptions]);

  const onSearchSelect = useCallback((val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
      navigate(trimmed);
      setSearchValue('');
      setSearchOptions([]);
      return;
    }
    navigate(`/stocks?search=${encodeURIComponent(trimmed)}`);
    setSearchValue('');
    setSearchOptions([]);
  }, [navigate]);

  return (
    <div
      style={{
        backgroundColor: 'var(--sq-bg)',
        color: 'var(--sq-text)',
        padding: '0 16px',
        borderBottom: '1px solid var(--sq-border)',
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
        <Space size={10} align="center" style={{ minWidth: 220 }}>
          <img src="/logo(1).png" alt="logo" style={{ height: 28, filter: 'saturate(1.05)' }} />
          <Text style={{ color: 'var(--sq-text)', fontSize: 18, fontWeight: 650, letterSpacing: 0.2 }}>
            AI智能选股引擎
          </Text>
        </Space>
      </a>

      {user ? (
        <Space size={12} align="center" style={{ flex: 1, minWidth: 0 }}>
          <Space size={8} style={{ minWidth: 0 }}>
            <Text style={{ color: 'var(--sq-text-tertiary)' }}>{breadcrumbItems.join(' / ')}</Text>
          </Space>
          <div style={{ flex: 1 }} />
          <AutoComplete
            value={searchValue}
            options={searchOptions}
            style={{ width: 520, maxWidth: '52vw' }}
            onChange={onSearchChange}
            onSelect={onSearchSelect}
          >
            <Input
              ref={searchInputRef}
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--sq-text-tertiary)' }} />}
              placeholder="全局搜索：代码/名称/功能（Ctrl/Cmd + K）"
              style={{ background: 'var(--sq-bg-elevated)' }}
            />
          </AutoComplete>
          <div style={{ flex: 1 }} />
        </Space>
      ) : (
        <Space size={12} align="center" style={{ flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <Space size={10}>
            <CalendarOutlined style={{ color: 'var(--sq-primary)' }} />
            <Text style={{ color: 'var(--sq-text-secondary)' }}>{currentTime.format('YYYY年MM月DD日 dddd')}</Text>
          </Space>
          <Space size={10}>
            <ClockCircleOutlined style={{ color: 'var(--sq-warning)' }} />
            <Text className="sq-mono" style={{ color: 'var(--sq-text-secondary)' }}>{currentTime.format('HH:mm:ss')}</Text>
          </Space>
        </Space>
      )}

      {user ? (
        <Space size={12} align="center" style={{ minWidth: 320, justifyContent: 'flex-end' }}>
          <Tag color={marketStatus.color} style={{ marginInlineEnd: 0 }}>
            {marketStatus.label}
          </Tag>
          <Text style={{ color: 'var(--sq-text-tertiary)' }}>{marketStatus.countdown}</Text>
          <Space size={10}>
            <CalendarOutlined style={{ color: 'var(--sq-primary)' }} />
            <Text style={{ color: 'var(--sq-text-secondary)' }}>{currentTime.format('YYYY年MM月DD日 dddd')}</Text>
          </Space>
          <Space size={10}>
            <ClockCircleOutlined style={{ color: 'var(--sq-warning)' }} />
            <Text className="sq-mono" style={{ color: 'var(--sq-text-secondary)' }}>{currentTime.format('HH:mm:ss')}</Text>
          </Space>
          <Badge dot>
            <a
              onClick={(e) => {
                e.preventDefault();
              }}
              style={{ color: 'var(--sq-text-secondary)' }}
            >
              <BellOutlined />
            </a>
          </Badge>
          <Dropdown
            menu={{
              items: menuItems,
              onClick: async ({ key }) => {
                if (key === 'user-management') {
                  navigate('/user-management');
                  return;
                }
                if (key === 'toggle-theme') {
                  onToggleThemeMode();
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
            <a onClick={(e) => e.preventDefault()} style={{ color: 'var(--sq-text-secondary)' }}>
              <Space>
                <Avatar size={28} style={{ backgroundColor: 'var(--sq-primary)' }}>
                  {avatarText}
                </Avatar>
                <Text style={{ color: 'var(--sq-text-secondary)' }}>{user.username}</Text>
                <DownOutlined style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }} />
              </Space>
            </a>
          </Dropdown>
        </Space>
      ) : (
        <Space size={12}>
          <Link onClick={() => navigate('/login')} style={{ color: 'var(--sq-text-secondary)' }}>
            登录
          </Link>
          <Link onClick={() => navigate('/register')} style={{ color: 'var(--sq-text-secondary)' }}>
            注册
          </Link>
        </Space>
      )}
    </div>
  );
};

export default TopBanner;
