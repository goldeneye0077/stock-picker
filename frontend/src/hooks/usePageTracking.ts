import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../services/analyticsService';

export function usePageTracking() {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const currentPath = location.pathname;
    if (prevPathRef.current === currentPath) {
      return;
    }

    prevPathRef.current = currentPath;
    trackPageView(currentPath, document.referrer || null);
  }, [location.pathname]);
}

export default usePageTracking;
