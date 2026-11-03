import { type ReactNode, useState } from 'react';
import { Choice, MenuScreen, Section } from '../ui/Menu';
import { cloud, cloudConfig, keyProblem, projectUrl, resetCloud, setCloudConfig } from './cloud';

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

  const perks: [string, string][] = [
    [
      'Cloud saves',
      'Your saves and autosave follow you: continue on another computer, phone or the desktop app.',
    ],
    ['Public games', 'List an online game you host so anyone can find it and join.'],
    [
      'Nothing else changes',
      'Single player, hotseat and online play with a join code never need an account.',
    ],
  ];
  const form = (children: ReactNode, onSubmit: () => void) => (
    <form
      className="mx-account-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );

  return (
    <MenuScreen
      title="Account"
      icon="influence"
      sub={c?.session ? `Signed in as ${c.session.name}` : 'Optional: cloud saves and public games'}
      onClose={onClose}
      className="mx-account"
    >
      <div className="mx-account-scroll">
        <div className="mx-panel mx-account-main">
          {!c ? (
            <Section title="Connect accounts">
              <p className="mx-account-text">
                Accounts need a free Supabase project. The{' '}
                <a href={GUIDE} target="_blank" rel="noreferrer">
                  setup guide
                </a>{' '}
                takes about ten minutes; then paste the project’s URL and publishable key here
                (they’re kept in this browser only), or build the game with them for everyone.
              </p>
              {form(
                <>
                  <label>
                    <span>Project URL</span>
                    <input
                      value={url}
                      placeholder="https://xxxx.supabase.co"
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Publishable key</span>
                    <input
                      value={key}
                      placeholder="sb_publishable_… (or the anon key, eyJ…)"
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="primary big">
                    Connect
                  </button>
                </>,
                () => {
                  if (!/^https:\/\/[^/]+/.test(projectUrl(url)))
                    return setMessage('Paste the project URL, like https://abcd.supabase.co');
                  const problem = keyProblem(key);
                  if (problem) return setMessage(problem);
                  setCloudConfig({ url, anonKey: key });
                  resetCloud();
                  refresh();
                },
              )}
            </Section>
          ) : c.session ? (
            <Section title="Signed in">
              <div className="mx-account-me">
                <span className="mx-random-head big">{c.session.name.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{c.session.name}</strong>
                  <p className="mx-account-text">
                    Your autosave goes to your account every turn. Cloud saves are in Load game, and
                    you can list your online games publicly when you host.
                  </p>
                  <button type="button" disabled={busy} onClick={() => void run(() => c.signOut())}>
                    Sign out
                  </button>
                </div>
              </div>
            </Section>
          ) : (
            <Section title={mode === 'in' ? 'Sign in' : 'Create an account'}>
              <Choice
                label="Sign in or create an account"
                className="mx-account-mode"
                value={mode}
                options={[
                  { value: 'in', label: 'Sign in' },
                  { value: 'up', label: 'Create an account' },
                ]}
                onChange={setMode}
              />
              {form(
                <>
                  <label>
                    <span>Username (or email)</span>
                    <input
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                  {mode === 'up' && (
                    <label>
                      <span>Name shown to others</span>
                      <input
                        value={name}
                        maxLength={24}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="primary big" disabled={busy}>
                    {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
                  </button>
                </>,
                () =>
                  void run(() =>
                    mode === 'in'
                      ? c.signIn(username, password)
                      : c.signUp(username, password, name || username),
                  ),
              )}
              <p className="mx-section-hint">
                A username is enough. Use a real email instead if you want to be able to reset a
                forgotten password.
              </p>
            </Section>
          )}
          {message && (
            <p className="mx-problem" role="alert">
              {message}
            </p>
          )}
          {c && !builtIn && cloudConfig() && (
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                setCloudConfig(null);
                resetCloud();
                refresh();
              }}
            >
              Disconnect this project
            </button>
          )}
        </div>
        <aside className="mx-panel mx-account-side">
          <Section title="What an account adds">
            <ul className="mx-perks">
              {perks.map(([t, d]) => (
                <li key={t}>
                  <strong>{t}</strong>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </MenuScreen>
  );
}
