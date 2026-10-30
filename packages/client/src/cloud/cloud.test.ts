import { describe, expect, it } from 'vitest';
import {
  Cloud,
  cloudConfig,
  emailFor,
  type KeyStore,
  setCloudConfig,
  usernameProblem,
} from './cloud';

function memory(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A fake Supabase: records calls and answers auth and REST like the real one. */
function fakeSupabase() {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] =
    [];
  const saves = new Map<
    string,
    { id: string; name: string; turn: number; data: unknown; updated_at: string }
  >();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    calls.push({ url, method, headers, body });
    const json = (status: number, value: unknown) =>
      new Response(value === null ? null : JSON.stringify(value), { status });
    if (url.includes('/auth/v1/signup') || url.includes('grant_type=password'))
      return body?.password === 'wrong password'
        ? json(400, { error_description: 'Invalid login credentials' })
        : json(200, {
            access_token: 'token-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
            user: { id: 'user-1', email: body?.email, user_metadata: { name: 'Payton' } },
          });
    if (url.includes('/rest/v1/saves')) {
      if (headers.Authorization !== 'Bearer token-1') return json(401, { message: 'JWT expired' });
      if (method === 'POST') {
        const row = body as {
          id: string;
          name: string;
          turn: number;
          data: unknown;
          updated_at: string;
        };
        saves.set(row.id, row);
        return json(201, null);
      }
      if (method === 'DELETE') {
        saves.delete(decodeURIComponent(url.split('id=eq.')[1]!));
        return json(204, null);
      }
      if (url.includes('select=data')) {
        const id = decodeURIComponent(url.split('id=eq.')[1]!.split('&')[0]!);
        return json(200, saves.has(id) ? [{ data: saves.get(id)!.data }] : []);
      }
      return json(200, [...saves.values()]);
    }
    if (url.includes('/rest/v1/lobbies'))
      return json(200, [
        { code: 'ABCDEF', host_name: 'Ann', open_seats: 2, info: {}, created_at: '2026-01-01' },
      ]);
    return json(404, { message: 'not found' });
  }) as typeof fetch;
  return { calls, saves, fetcher };
}

const config = { url: 'https://example.supabase.co', anonKey: 'anon-key' };

describe('the cloud', () => {
  it('is off unless configured, and remembers a pasted project', () => {
    const store = memory();
    expect(cloudConfig(store)).toBeNull();
    setCloudConfig({ url: 'https://x.supabase.co/', anonKey: ' key ' }, store);
    expect(cloudConfig(store)).toEqual({ url: 'https://x.supabase.co', anonKey: 'key' });
    setCloudConfig(null, store);
    expect(cloudConfig(store)).toBeNull();
  });

  it('turns usernames into private sign-in addresses and checks them', () => {
    expect(emailFor('Payton_1')).toBe('payton_1@players.civiusmaximus.invalid');
    expect(emailFor('me@example.com')).toBe('me@example.com');
    expect(usernameProblem('ab')).toBeDefined();
    expect(usernameProblem('good_name')).toBeUndefined();
  });

  it('signs up, keeps the session, and saves to the cloud', async () => {
    const store = memory();
    const fake = fakeSupabase();
    const c = new Cloud(config, fake.fetcher, store);
    await c.signUp('payton', 'secret password', 'Payton');
    expect(c.session).toMatchObject({ userId: 'user-1', name: 'Payton' });
    expect(fake.calls[0]!.body).toMatchObject({ email: 'payton@players.civiusmaximus.invalid' });
    // A new page finds the session.
    expect(new Cloud(config, fake.fetcher, store).signedIn).toBe(true);

    await c.putSave('s1', 'Turn 12', 12, { state: 'x' });
    expect(await c.listSaves()).toMatchObject([{ id: 's1', name: 'Turn 12', turn: 12 }]);
    expect(await c.getSave('s1')).toEqual({ state: 'x' });
    await c.deleteSave('s1');
    expect(await c.listSaves()).toEqual([]);
    expect(fake.calls.every((x) => x.headers.apikey === 'anon-key')).toBe(true);
  });

  it('reports a bad password, needs an account to save, and lists lobbies for anyone', async () => {
    const fake = fakeSupabase();
    const c = new Cloud(config, fake.fetcher, memory());
    await expect(c.signIn('payton', 'wrong password')).rejects.toThrow('Invalid login credentials');
    await expect(c.listSaves()).rejects.toThrow('Sign in first');
    expect(await c.listLobbies()).toMatchObject([
      { code: 'ABCDEF', hostName: 'Ann', openSeats: 2 },
    ]);
    await c.signOut();
    expect(c.signedIn).toBe(false);
  });
});
