/**
 * Accounts, cloud saves and public lobbies on Supabase (docs/01-architecture.md, "Accounts";
 * docs/guides/supabase.md). Switched on by configuration: the build's `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_ANON_KEY`, or a project URL and key pasted into the Account dialog (kept in this
 * browser). Without either, everything here stays off and the game needs no account.
 *
 * It talks to Supabase's REST endpoints directly (no SDK): GoTrue for sign-up and sign-in,
 * PostgREST for the `saves` and `lobbies` tables, whose row-level security only lets players
 * see and change their own rows (packages/backend/supabase/migrations).
 */

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch. */
  expiresAt: number;
  userId: string;
  name: string;
}

export interface CloudSave {
  id: string;
  name: string;
  turn: number;
  updatedAt: string;
}

export interface PublicLobby {
  code: string;
  hostName: string;
  openSeats: number;
  info: Record<string, unknown>;
  createdAt: string;
}

/** Key/value storage (localStorage in the browser; a map in tests). */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CONFIG_KEY = 'cx.cloud.config';
const SESSION_KEY = 'cx.cloud.session';
/** Placeholder addresses for players who sign up with a username only (email confirmation off). */
export const PLAYER_DOMAIN = 'players.civiusmaximus.invalid';

const browserStore = (): KeyStore | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/** The project this build or this browser is set up for, if any. */
export function cloudConfig(store: KeyStore | undefined = browserStore()): CloudConfig | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)
    return { url: env.VITE_SUPABASE_URL.replace(/\/$/, ''), anonKey: env.VITE_SUPABASE_ANON_KEY };
  try {
    const saved = store?.getItem(CONFIG_KEY);
    if (!saved) return null;
    const c = JSON.parse(saved) as CloudConfig;
    return c.url && c.anonKey ? { url: c.url.replace(/\/$/, ''), anonKey: c.anonKey } : null;
  } catch {
    return null;
  }
}

/** Points this browser at a project (null forgets it). */
export function setCloudConfig(
  c: CloudConfig | null,
  store: KeyStore | undefined = browserStore(),
) {
  if (!store) return;
  if (c)
    store.setItem(CONFIG_KEY, JSON.stringify({ url: c.url.trim(), anonKey: c.anonKey.trim() }));
  else store.removeItem(CONFIG_KEY);
}

/** A username's sign-in address: a real email as given, or the private placeholder. */
export function emailFor(username: string): string {
  const u = username.trim();
  return u.includes('@') ? u.toLowerCase() : `${u.toLowerCase()}@${PLAYER_DOMAIN}`;
}

export function usernameProblem(username: string): string | undefined {
  const u = username.trim();
  if (u.includes('@'))
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u) ? undefined : 'That email looks wrong';
  return /^[a-zA-Z0-9_]{3,20}$/.test(u)
    ? undefined
    : 'Usernames are 3 to 20 letters, digits or underscores';
}

export class Cloud {
  session: Session | null;

  constructor(
    readonly config: CloudConfig,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly store: KeyStore | undefined = browserStore(),
  ) {
    this.session = this.loadSession();
  }

  get signedIn() {
    return this.session !== null;
  }

  /** Creates an account (signed in at once when email confirmation is off). */
  async signUp(username: string, password: string, name = username): Promise<void> {
    const problem = usernameProblem(username);
    if (problem) throw new Error(problem);
    if (password.length < 8) throw new Error('Passwords need at least 8 characters');
    const r = await this.auth('signup', {
      email: emailFor(username),
      password,
      data: { name: name.trim().slice(0, 24) || username },
    });
    if (!r.access_token)
      throw new Error('Account created. Confirm your email, then sign in (see the setup guide).');
    this.keep(r);
  }

  async signIn(username: string, password: string): Promise<void> {
    this.keep(
      await this.auth('token?grant_type=password', { email: emailFor(username), password }),
    );
  }

  async signOut(): Promise<void> {
    const s = this.session;
    this.forget();
    if (s)
      await this.fetcher(`${this.config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: this.config.anonKey, Authorization: `Bearer ${s.accessToken}` },
      }).catch(() => undefined);
  }

  // --- Saves ---

  async listSaves(): Promise<CloudSave[]> {
    const rows = (await this.rest(
      'saves?select=id,name,turn,updated_at&order=updated_at.desc',
    )) as { id: string; name: string; turn: number; updated_at: string }[];
    return rows.map((r) => ({ id: r.id, name: r.name, turn: r.turn, updatedAt: r.updated_at }));
  }

  async putSave(id: string, name: string, turn: number, data: unknown): Promise<void> {
    await this.rest('saves?on_conflict=owner,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id, name, turn, data, updated_at: new Date().toISOString() }),
    });
  }

  async getSave(id: string): Promise<unknown> {
    const rows = (await this.rest(`saves?id=eq.${encodeURIComponent(id)}&select=data`)) as {
      data: unknown;
    }[];
    if (!rows[0]) throw new Error('That save is gone');
    return rows[0].data;
  }

  async deleteSave(id: string): Promise<void> {
    await this.rest(`saves?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // --- Public lobbies ---

  /** Open games anyone can join, newest first (no account needed to look). */
  async listLobbies(): Promise<PublicLobby[]> {
    const now = new Date().toISOString();
    const rows = (await this.rest(
      `lobbies?select=code,host_name,open_seats,info,created_at&expires_at=gt.${now}&order=created_at.desc&limit=30`,
      {},
      false,
    )) as {
      code: string;
      host_name: string;
      open_seats: number;
      info: Record<string, unknown>;
      created_at: string;
    }[];
    return rows.map((r) => ({
      code: r.code,
      hostName: r.host_name,
      openSeats: r.open_seats,
      info: r.info ?? {},
      createdAt: r.created_at,
    }));
  }

  async announceLobby(
    code: string,
    hostName: string,
    openSeats: number,
    info: Record<string, unknown>,
  ) {
    await this.rest('lobbies?on_conflict=code', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ code, host_name: hostName, open_seats: openSeats, info }),
    });
  }

  async closeLobby(code: string) {
    await this.rest(`lobbies?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE' });
  }

  // --- Plumbing ---

  private async auth(path: string, body: unknown): Promise<AuthReply> {
    const res = await this.fetcher(`${this.config.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: this.config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as AuthReply & {
      msg?: string;
      error_description?: string;
      message?: string;
    };
    if (!res.ok)
      throw new Error(json.error_description ?? json.msg ?? json.message ?? 'Sign-in failed');
    return json;
  }

  private async rest(path: string, init: RequestInit = {}, needsAccount = true): Promise<unknown> {
    if (needsAccount && !this.session) throw new Error('Sign in first');
    if (this.session && this.session.expiresAt - 60 < Date.now() / 1000) await this.refresh();
    const token = this.session?.accessToken ?? this.config.anonKey;
    const res = await this.fetcher(`${this.config.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(json.message ?? `The cloud said no (${res.status})`);
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  }

  private async refresh() {
    const s = this.session;
    if (!s) return;
    try {
      this.keep(
        await this.auth('token?grant_type=refresh_token', { refresh_token: s.refreshToken }),
      );
    } catch {
      this.forget();
      throw new Error('Your sign-in expired; sign in again');
    }
  }

  private keep(r: AuthReply) {
    if (!r.access_token || !r.refresh_token || !r.user) throw new Error('Sign-in failed');
    this.session = {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expiresAt: r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600),
      userId: r.user.id,
      name:
        (r.user.user_metadata?.name as string | undefined) ??
        r.user.email?.split('@')[0] ??
        'Player',
    };
    this.store?.setItem(SESSION_KEY, JSON.stringify(this.session));
  }

  private forget() {
    this.session = null;
    this.store?.removeItem(SESSION_KEY);
  }

  private loadSession(): Session | null {
    try {
      const raw = this.store?.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
}

interface AuthReply {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id: string; email?: string; user_metadata?: Record<string, unknown> };
}

let shared: Cloud | null | undefined;
/** The cloud for this page, or null when it isn't set up. */
export function cloud(): Cloud | null {
  if (shared === undefined) {
    const c = cloudConfig();
    shared = c ? new Cloud(c) : null;
  }
  return shared;
}
/** After the configuration changed (the Account dialog). */
export function resetCloud() {
  shared = undefined;
}
