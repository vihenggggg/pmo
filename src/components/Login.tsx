import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { btn } from './Modal';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(passphrase);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <h1 className="text-lg font-semibold">Viheng SO Tracker</h1>
            <p className="text-sm text-slate-500">Enter the passphrase to continue</p>
          </div>
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pass">Passphrase</label>
        <input
          id="pass"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy || !passphrase} className={`${btn.primary} mt-4 w-full justify-center`}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
