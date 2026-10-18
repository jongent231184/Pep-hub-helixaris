import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SKIP = ['/admin', '/hub', '/coach', '/ambassador', '/portal'];

const PageViewTracker = () => {
  const { pathname } = useLocation();
  const last = useRef(null);

  useEffect(() => {
    if (last.current === pathname) return;
    const isFirst = last.current === null;
    last.current = pathname;
    if (SKIP.some(p => pathname.startsWith(p))) return;
    const body = JSON.stringify({
      path: pathname,
      referrer: isFirst ? document.referrer : '',
      screen_w: window.innerWidth,
    });
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/analytics/pv`;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
};

export default PageViewTracker;
