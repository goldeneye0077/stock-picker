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
  MessageOutlined,
} from '@ant-design/icons';
import Home from './pages/Home';
import StockList from './pages/StockList';
import Settings from './pages/Settings';
import SmartSelection from './pages/SmartSelection';
import SuperMainForce from './pages/SuperMainForce';
import Login from './pages/Login';
import Register from './pages/Register';
import UserManagement from './pages/UserManagement';
import ContactManagement from './pages/ContactManagement';
import Contact from './pages/Contact';
import UserAgreement from './pages/UserAgreement';
import PrivacyPolicy from './pages/PrivacyPolicy';
import SiteAnalytics from './pages/SiteAnalytics';
import TopBanner from './components/DateTimeBanner';
import GlobalDisclaimer from './components/GlobalDisclaimer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { usePageTracking } from './hooks/usePageTracking';
import FigmaShellLayout from './components/FigmaShellLayout';

const { darkAlgorithm, defaultAlgorithm } = theme;

const menuItems = [
  {
    path: '/home',
    name: '棣栭〉',
    icon: <HomeOutlined />,
  },
  {
    path: '/super-main-force',
    name: '瓒呭己涓诲姏',
    icon: <ThunderboltOutlined />,
  },
  {
    path: '/smart-selection',
    name: '精选智选',
    icon: <CalculatorOutlined />,
  },
  {
    path: '/stocks',
    name: '鑲＄エ鍒楄〃',
    icon: <StockOutlined />,
  },
  {
    path: '/watchlist',
    name: '鑷€夎偂',
    icon: <StarOutlined />,
  },
  {
    path: '/settings',
    name: '璁剧疆',
    icon: <SettingOutlined />,
  },
  {
    path: '/user-management',
    name: '鐢ㄦ埛绠＄悊',
    icon: <TeamOutlined />,
  },
  {
    path: '/site-analytics',
    name: '网站统计',
    icon: <AreaChartOutlined />,
  },
  {
    path: '/contact-management',
    name: '留言管理',
    icon: <MessageOutlined />,
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

  if (['/user-management', '/site-analytics', '/contact-management'].includes(path) && !user.isAdmin) {
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

  // 椤甸潰璁块棶杩借釜
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
    if (item.path === '/user-management' || item.path === '/site-analytics' || item.path === '/contact-management') return user?.isAdmin;
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
      logo={null}
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
      footerRender={false}
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
          path="/contact-management"
          element={
            <RequireAuth path="/contact-management">
              <ContactManagement />
            </RequireAuth>
          }
        />
        <Route
          path="/forbidden"
          element={
            <Result
              status="403"
              title="403"
              subTitle="鏃犳潈闄愯闂椤甸潰"
              extra={
                <a
                  onClick={() => {
                    navigate(firstAllowedPath(), { replace: true });
                  }}
                >
                  杩斿洖鍙闂椤?
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
      '/': '棣栭〉',
      '/home': '棣栭〉',
      '/login': '鐧诲綍',
      '/register': '娉ㄥ唽',
      '/contact': '联系我',
      '/forbidden': '无权限',
      '/contact-management': '留言管理',
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
        colorPrimary: '#1D61FF',
        colorInfo: '#1D61FF',
        colorSuccess: '#10B981',
        colorWarning: '#F59E0B',
        colorError: '#EF4444',
        colorLink: '#1D61FF',
        colorBgBase: '#0B0F19',
        colorBgLayout: '#0B0F19',
        colorBgContainer: '#101524',
        colorBgElevated: '#161b2e',
        colorBorder: 'rgba(148, 163, 184, 0.15)',
        colorText: '#FFFFFF',
        colorTextSecondary: '#94A3B8',
        colorTextTertiary: '#64748B',
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
            paddingBottom: 56,
            boxSizing: 'border-box',
            overflow: 'auto',
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/contact" element={<Contact />} />
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
                path="/site-analytics"
                element={
                  <RequireAuth path="/site-analytics">
                    <SiteAnalytics />
                  </RequireAuth>
                }
              />
              <Route
                path="/contact-management"
                element={
                  <RequireAuth path="/contact-management">
                    <ContactManagement />
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
        <GlobalDisclaimer />
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

