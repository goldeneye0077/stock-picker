const API_BASE = import.meta.env.VITE_API_BASE || '/api';

interface PageViewPayload {
    page_path: string;
}

// 记录页面访问
export async function trackPageView(pagePath: string): Promise<void> {
    try {
        const token = localStorage.getItem('sq_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        await fetch(`${API_BASE}/analytics/page-view`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ page_path: pagePath } as PageViewPayload),
        });
    } catch (err) {
        // 静默失败，不影响用户体验
        console.debug('Failed to track page view:', err);
    }
}
