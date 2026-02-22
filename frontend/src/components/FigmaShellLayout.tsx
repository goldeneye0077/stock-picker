import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AreaChartOutlined,
  ArrowUpOutlined,
  CalculatorOutlined,
  HomeOutlined,
  MailOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
  StockOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import './FigmaShellLayout.css';

type NavItem = {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const figmaNavItems: NavItem[] = [
  { path: '/home', label: '首页概览', icon: <HomeOutlined /> },
  { path: '/super-main-force', label: '超强主力', icon: <ThunderboltOutlined /> },
  { path: '/smart-selection', label: '精选智选', icon: <CalculatorOutlined /> },
  { path: '/stocks', label: '股票列表', icon: <StockOutlined /> },
  { path: '/watchlist', label: '自选股', icon: <StarOutlined /> },
  { path: '/site-analytics', label: '网站统计', icon: <AreaChartOutlined />, adminOnly: true },
  { path: '/contact-management', label: '留言管理', icon: <MailOutlined />, adminOnly: true },
  { path: '/user-management', label: '用户管理', icon: <TeamOutlined />, adminOnly: true },
  { path: '/settings', label: '系统设置', icon: <SettingOutlined /> },
];

const FigmaShellLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canAccess } = useAuth();
  const [searchValue, setSearchValue] = useState('');

  const navItems = useMemo(() => {
    return figmaNavItems.filter((item) => {
      if (item.adminOnly && !user?.isAdmin) {
        return false;
      }
      if (item.path === '/home') {
        return true;
      }
      return canAccess(item.path);
    });
  }, [canAccess, user?.isAdmin]);

  return (
    <div className="sq-figma-shell" data-sq-figma="true">
      <header className="sq-figma-header">
        <div className="sq-figma-headerLeft">
          <div className="sq-figma-searchContainer">
            <SearchOutlined className="sq-figma-searchIcon" />
            <input
              type="text"
              className="sq-figma-searchInput"
              placeholder="搜索股票代码 / 名称 / 概念..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
            <kbd className="sq-figma-kbd">Ctrl+K</kbd>
          </div>
        </div>

        <div className="sq-figma-headerRight">
          <div className="sq-figma-marketIndex">
            <div className="sq-figma-indexLabel">上证指数</div>
            <div className="sq-figma-indexValue">
              3,052.14
              <ArrowUpOutlined className="sq-figma-indexIcon" />
            </div>
          </div>

          <div className="sq-figma-separator" />

          <button className="sq-figma-headerButton" aria-label="Notifications">
            <span className="sq-figma-notifDot" />
          </button>
        </div>
      </header>

      <div className="sq-figma-bodyContainer">
        <aside className="sq-figma-sider">
          <div
            className="sq-figma-brand"
            style={{ display: 'none' }}
            onClick={() => navigate('/home')}
            role="button"
            tabIndex={0}
          >
            <div className="sq-figma-brandMark" aria-hidden="true">
              A
            </div>
            <div className="sq-figma-brandText">
              <span className="sq-figma-brandAlpha">Alpha</span>
              <span className="sq-figma-brandQuant">Quant</span>
            </div>
          </div>

          <nav className="sq-figma-nav" aria-label="主导航">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <a
                  key={item.path}
                  className={active ? 'sq-figma-navItem is-active' : 'sq-figma-navItem'}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(item.path);
                  }}
                >
                  <span className="sq-figma-navIcon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sq-figma-navLabel">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="sq-figma-siderFooter">
            <div className="sq-figma-userCard">
              <div className="sq-figma-avatar" aria-hidden="true">
                {String(user?.username || 'GU').slice(0, 2).toUpperCase()}
              </div>
              <div className="sq-figma-userMeta">
                <div className="sq-figma-userName">{user?.username || 'Guest User'}</div>
                <div className="sq-figma-userPlan">{user?.isAdmin ? 'Admin' : 'Pro Plan'}</div>
              </div>
              <div className="sq-figma-liveTag">Live Data</div>
            </div>
          </div>
        </aside>

        <div className="sq-figma-main">
          <main className="sq-figma-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default FigmaShellLayout;
