import { useEffect, useState } from 'react';

export type Route = { page: 'dashboard' } | { page: 'orders'; focus?: number };

function parse(hash: string): Route {
  const [path, qs] = hash.replace(/^#\/?/, '').split('?');
  if (path === 'orders') {
    const focus = Number(new URLSearchParams(qs).get('focus'));
    return { page: 'orders', focus: Number.isInteger(focus) && focus > 0 ? focus : undefined };
  }
  return { page: 'dashboard' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const hrefFor = (r: Route) => (r.page === 'orders' ? `#/orders${r.focus ? `?focus=${r.focus}` : ''}` : '#/dashboard');
