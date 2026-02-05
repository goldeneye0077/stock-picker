import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, Result, Spin, theme } from 'antd';
import { ProLayout } from '@ant-design/pro-layout';
import {
  StockOutlined,
  SettingOutlined,
  CalculatorOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  HomeOutlined,
  StarOutlined,
  AreaChartOutlined,
} from '@ant-design/icons';
import Home from './pages/Home';
import StockList from './pages/StockList';
import Settings from './pages/Settings';
import SmartSelection from './pages/SmartSelection';
import SuperMainForce from './pages/SuperMainForce';
import Login from './pages/Login';
import Register from './pages/Register';
import UserManagement from './pages/UserManagement';
import UserAgreement from './pages/UserAgreement';
import PrivacyPolicy from './pages/PrivacyPolicy';
import SiteAnalytics from './pages/SiteAnalytics';
import TopBanner from './components/DateTimeBanner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { usePageTracking } from './hooks/usePageTracking';
import FigmaShellLayout from './components/FigmaShellLayout';

const { darkAlgorithm, defaultAlgorithm } = theme;

const menuItems = [
  {
    path: '/home',
    name: '首页',
    icon: <HomeOutlined />,
  },
  {
    path: '/super-main-force',
    name: '超强主力',
    icon: <ThunderboltOutlined />,
  },
  {
    path: '/smart-selection',
    name: '精算智选',
    icon: <CalculatorOutlined />,
  },
  {
    path: '/stocks',
    name: '股票列表',
    icon: <StockOutlined />,
  },
  {
    path: '/watchlist',
    name: '自选股',
    icon: <StarOutlined />,
  },
  {
    path: '/settings',
    name: '设置',
    icon: <SettingOutlined />,
  },
  {
    path: '/user-management',
    name: '用户管理',
    icon: <TeamOutlined />,
  },
  {
    path: '/site-analytics',
    name: '网站统计',
    icon: <AreaChartOutlined />,
  },
];

function RequireAuth({ path, children }: { path: string; children: React.ReactNode }) {
  const location = useLocation();
  const { loading, user, canAccess } = useAuth();

  if (path === '/home' || path === '/') {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (path === '/user-management' && !user.isAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  if (!canAccess(path)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, firstAllowedPath, canAccess, loading } = useAuth();
  const isHomePage = location.pathname === '/home' || location.pathname === '/';

  // 页面访问追踪
  usePageTracking();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user && !isHomePage) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.path) return false;
    if (item.path === '/home') return true;
    return canAccess(item.path);
  });
  const menuItemsWithAdminGuard = visibleMenuItems.filter((item) => {
    if (!item.path) return false;
    if (item.path === '/user-management' || item.path === '/site-analytics') return user?.isAdmin;
    return true;
  });

  if (location.pathname === '/home' || location.pathname === '/') {
    return (
      <RequireAuth path="/home">
        <Home />
      </RequireAuth>
    );
  }

  return (
    <ProLayout
      style={{ height: '100%' }}
      title={false}
      logo={<img src="/logo.png" alt="logo" style={{ height: '32px' }} />}
      onMenuHeaderClick={() => navigate('/home')}
      route={{
        routes: menuItemsWithAdminGuard,
      }}
      location={{
        pathname: location.pathname,
      }}
      selectedKeys={[location.pathname]}
      layout="side"
      siderWidth={200}
      collapsed={false}
      headerRender={false}
      footerRender={() => (
        <div
          style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--sq-text-secondary)',
            background: 'var(--sq-bg)',
            borderTop: '1px solid var(--sq-border)',
          }}
        >
          本引擎仅供学习，不作为投资依据，严禁用作商业用途
        </div>
      )}
      contentStyle={{
        margin: 0,
        padding: 0,
        minHeight: '100%',
      }}
      menuItemRender={(item, dom) => (
        <a
          onClick={() => {
            navigate(item.path || '/');
          }}
        >
          {dom}
        </a>
      )}
    >
      <Routes>
        <Route
          path="/home"
          element={
            <RequireAuth path="/home">
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/stocks"
          element={
            <RequireAuth path="/stocks">
              <StockList mode="all" />
            </RequireAuth>
          }
        />
        <Route
          path="/watchlist"
          element={
            <RequireAuth path="/watchlist">
              <StockList mode="watchlist" />
            </RequireAuth>
          }
        />
        <Route
          path="/smart-selection"
          element={
            <RequireAuth path="/smart-selection">
              <SmartSelection />
            </RequireAuth>
          }
        />
        <Route
          path="/super-main-force"
          element={
            <RequireAuth path="/super-main-force">
              <SuperMainForce />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth path="/settings">
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/user-management"
          element={
            <RequireAuth path="/user-management">
              <UserManagement />
            </RequireAuth>
          }
        />
        <Route
          path="/site-analytics"
          element={
            <RequireAuth path="/site-analytics">
              <SiteAnalytics />
            </RequireAuth>
          }
        />
        <Route
          path="/forbidden"
          element={
            <Result
              status="403"
              title="403"
              subTitle="无权限访问该页面"
              extra={
                <a
                  onClick={() => {
                    navigate(firstAllowedPath(), { replace: true });
                  }}
                >
                  返回可访问首页
                </a>
              }
            />
          }
        />
        <Route path="*" element={<Navigate to={firstAllowedPath()} replace />} />
      </Routes>
    </ProLayout>
  );
}

function App() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    const raw = window.localStorage.getItem('sq_theme_mode');
    return raw === 'light' ? 'light' : 'dark';
  });

  const [isGrayscale, setIsGrayscale] = useState<boolean>(() => {
    return window.localStorage.getItem('sq_grayscale_mode') === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem('sq_theme_mode', themeMode);
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem('sq_grayscale_mode', isGrayscale.toString());
    document.documentElement.setAttribute('data-grayscale', isGrayscale.toString());
  }, [isGrayscale]);

  const routeLabels = useMemo(() => {
    const map: Record<string, string> = {
      '/': '首页',
      '/home': '首页',
      '/login': '登录',
      '/register': '注册',
      '/forbidden': '无权限',
    };
    for (const item of menuItems) {
      if (item.path && item.name) map[item.path] = item.name;
    }
    return map;
  }, []);

  const themeConfig = useMemo(() => {
    if (themeMode === 'light') {
      return {
        algorithm: defaultAlgorithm,
        token: {
          colorPrimary: '#2e90fa',
          colorBgBase: '#ffffff',
          colorBgLayout: '#f5f6f8',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#e5e7eb',
          colorText: 'rgba(0, 0, 0, 0.88)',
          colorTextSecondary: 'rgba(0, 0, 0, 0.65)',
          colorTextTertiary: 'rgba(0, 0, 0, 0.45)',
          borderRadius: 8,
          fontFamily:
            'Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
          fontFamilyCode:
            'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
        components: {
          Table: {
            headerBg: '#ffffff',
            headerColor: 'rgba(0, 0, 0, 0.65)',
          },
          Tag: {
            borderRadiusSM: 2,
          },
        },
      };
    }

    return {
      algorithm: darkAlgorithm,
      token: {
        colorPrimary: '#615fff',
        colorInfo: '#615fff',
        colorSuccess: '#00f5a0',
        colorWarning: '#ffb020',
        colorError: '#ff375f',
        colorLink: '#615fff',
        colorBgBase: '#020618',
        colorBgLayout: '#020618',
        colorBgContainer: '#0f172b',
        colorBgElevated: '#0f172b',
        colorBorder: '#1d293d',
        colorText: '#f1f5f9',
        colorTextSecondary: '#90a1b9',
        colorTextTertiary: '#62748e',
        borderRadius: 10,
        fontFamily:
          'Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
        fontFamilyCode:
          'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
      components: {
        Card: {
          paddingLG: 20,
        },
        Table: {
          headerBg: '#0f172b',
          headerColor: '#90a1b9',
        },
        Modal: {
          contentBg: '#0f172b',
          headerBg: '#0f172b',
        },
        Tag: {
          borderRadiusSM: 2,
        },
      },
    };
  }, [themeMode]);

  const AppFrame: React.FC = () => {
    return (
      <div style={{ width: '100vw', height: '100vh' }}>
        <TopBanner
          themeMode={themeMode}
          onToggleThemeMode={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
          isGrayscale={isGrayscale}
          onToggleGrayscale={() => setIsGrayscale((v) => !v)}
          routeLabels={routeLabels}
        />
        <div
          style={{
            height: '100%',
            paddingTop: 48,
            boxSizing: 'border-box',
            overflow: 'auto',
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/user-agreement" element={<UserAgreement />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route element={<FigmaShellLayout />}>
              <Route
                path="/super-main-force"
                element={
                  <RequireAuth path="/super-main-force">
                    <SuperMainForce />
                  </RequireAuth>
                }
              />
              <Route
                path="/smart-selection"
                element={
                  <RequireAuth path="/smart-selection">
                    <SmartSelection />
                  </RequireAuth>
                }
              />
              <Route
                path="/stocks"
                element={
                  <RequireAuth path="/stocks">
                    <StockList mode="all" />
                  </RequireAuth>
                }
              />
              <Route
                path="/watchlist"
                element={
                  <RequireAuth path="/watchlist">
                    <StockList mode="watchlist" />
                  </RequireAuth>
                }
              />
              <Route
                path="/user-management"
                element={
                  <RequireAuth path="/user-management">
                    <UserManagement />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth path="/settings">
                    <Settings />
                  </RequireAuth>
                }
              />
            </Route>
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </div>
      </div>
    );
  };

  return (
    <ConfigProvider
      theme={themeConfig}
    >
      <AuthProvider>
        <Router>
          <AppFrame />
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
