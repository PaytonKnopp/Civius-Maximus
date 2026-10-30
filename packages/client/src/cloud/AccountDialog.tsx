import { useState } from 'react';
import { cloud, cloudConfig, resetCloud, setCloudConfig } from './cloud';

const GUIDE = 'https://github.com/PaytonKnopp/Civius-Maximus/blob/main/docs/guides/supabase.md';

/**
 * Accounts (docs/01-architecture.md, "Accounts"): sign in or create an account when this build or
 * browser is set up with a Supabase project, or connect one here. Nothing in the game needs an
 * account except cloud saves and listing a game publicly.
 */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const [, redraw] = useState(0);
  const refresh = () => redraw((n) => n + 1);
  const c = cloud();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const builtIn = !!(import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SUPABASE_URL;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog account-dialog"
        role="dialog"
        aria-labelledby="account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="account-title">Account</h2>
        {!c ? (
          <>
            <p>
              Single player, hotseat and online play with a join code need no account. An account
              adds cloud saves (play on any device) and public games anyone can join from a list.
            </p>
            <p className="hint">
              Accounts need a free Supabase project. The{' '}
              <a href={GUIDE} target="_blank" rel="noreferrer">
                setup guide
              </a>{' '}
              takes about ten minutes; then paste the project’s URL and anon key here (they’re kept
              in this browser only), or build the game with them for everyone.
            </p>
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!url.trim().startsWith('https://') || !key.trim())
                  return setMessage('Paste the project URL (https://…) and its anon public key.');
                setCloudConfig({ url, anonKey: key });
                resetCloud();
                refresh();
              }}
            >
              <label>
                Project URL
                <input
                  value={url}
                  placeholder="https://xxxx.supabase.co"
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Anon public key
                <input value={key} onChange={(e) => setKey(e.target.value)} />
              </label>
              <button type="submit" className="primary">
                Connect
              </button>
            </form>
          </>
        ) : c.session ? (
          <>
            <p>
              Signed in as <strong>{c.session.name}</strong>. Cloud saves are in Save / Load, and
              you can list your online games publicly when you host.
            </p>
            <div className="dialog-actions">
              <button type="button" disabled={busy} onClick={() => void run(() => c.signOut())}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="segmented" role="group" aria-label="Sign in or create an account">
              {(['in', 'up'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={mode === m ? 'on' : ''}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m === 'in' ? 'Sign in' : 'Create an account'}
                </button>
              ))}
            </div>
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  mode === 'in'
                    ? c.signIn(username, password)
                    : c.signUp(username, password, name || username),
                );
              }}
            >
              <label>
                Username (or email)
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              {mode === 'up' && (
                <label>
                  Name shown to others
                  <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <label>
                Password
                <input
                  type="password"
                  autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" className="primary" disabled={busy}>
                {mode === 'in' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <p className="hint">
              A username is enough. Add a real email instead if you want to reset a forgotten
              password.
            </p>
          </>
        )}
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <div className="dialog-actions">
          {c && !builtIn && cloudConfig() && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setCloudConfig(null);
                resetCloud();
                refresh();
              }}
            >
              Disconnect this project
            </button>
          )}
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
