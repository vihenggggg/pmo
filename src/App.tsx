import { useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { OrdersPage } from './components/OrdersPage';
import { api, UNAUTHORIZED_EVENT } from './lib/api';
import { useRoute } from './lib/route';

export default function App() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  const route = useRoute();

  useEffect(() => {
    api.session().then((s) => setAuth(s.authenticated ? 'in' : 'out')).catch(() => setAuth('out'));
    const onUnauthorized = () => setAuth('out');
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (auth === 'checking') return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (auth === 'out') return <Login onSuccess={() => setAuth('in')} />;

  const tab = (page: 'dashboard' | 'orders', label: string) => (
    <a
      href={`#/${page}`}
      aria-current={route.page === page ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${route.page === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'}`}
    >
      {label}
    </a>
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] items-center gap-4 px-4 py-2.5">
          <a href="#/dashboard" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <span className="hidden sm:inline">Viheng SO Tracker</span>
          </a>
          <nav className="flex gap-1">
            {tab('dashboard', 'Dashboard')}
            {tab('orders', 'Sales Orders')}
          </nav>
          <button
            className="ml-auto text-sm text-slate-500 hover:text-slate-900"
            onClick={() => api.logout().finally(() => setAuth('out'))}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-5">
        {route.page === 'dashboard' ? <Dashboard /> : <OrdersPage focusId={route.focus} />}
      </main>
    </div>
  );
}
