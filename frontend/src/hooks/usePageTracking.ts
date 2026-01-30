import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/**
 * 页面访问追踪 Hook
 * 每次路由变化时向后端发送埋点
 */
export function usePageTracking() {
    const location = useLocation();
    const prevPathRef = useRef<string | null>(null);

    useEffect(() => {
        const currentPath = location.pathname;

        // 避免重复记录同一路径
        if (prevPathRef.current === currentPath) {
            return;
        }
        prevPathRef.current = currentPath;

        // 发送埋点请求
        const trackPageView = async () => {
            try {
                const token = localStorage.getItem('sq_token');
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                // 尝试获取或生成 session_id
                let sessionId = localStorage.getItem('sq_session_id');
                if (!sessionId) {
                    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                    localStorage.setItem('sq_session_id', sessionId);
                }
                headers['X-Session-Id'] = sessionId;

                await fetch(`${API_BASE}/analytics/page-view`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        page_path: currentPath,
                        referrer: document.referrer || null,
                    }),
                });
            } catch (error) {
                // 静默失败，不影响用户体验
                console.debug('Page tracking failed:', error);
            }
        };

        trackPageView();
    }, [location.pathname]);
}

export default usePageTracking;
