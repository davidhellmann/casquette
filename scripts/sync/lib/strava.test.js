import { describe, expect, it } from 'vitest';
import { createStravaClient } from './strava.mjs';

const NOW = Date.parse('2024-05-01T12:07:30Z');
const json = (body, { status = 200, usage = '10,100', limit = '100,1000' } = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'x-readratelimit-usage': usage, 'x-readratelimit-limit': limit },
});

/** Strava client with a scripted fetch, a fake clock (sleeping only advances time) and an in-memory token store. */
function setup(answers, { token = { access_token: 'old', refresh_token: 'r1', expires_at: NOW / 1000 + 2 * 86400 } } = {}) {
  let now = NOW;
  const slept = [], requests = [], logs = [];
  let stored = token;
  const fetch = async (url, init) => {
    requests.push({ url: String(url), auth: init?.headers?.Authorization ?? null, body: init?.body ? String(init.body) : null });
    const next = answers.shift();
    if (!next) throw new Error('No scripted answer left');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  const client = createStravaClient({
    fetch,
    clock: { now: () => now, sleep: async (ms) => { slept.push(ms); now += ms; } },
    tokens: { read: () => stored, write: (t) => { stored = t; } },
    env: { STRAVA_CLIENT_ID: 'id', STRAVA_CLIENT_SECRET: 'secret' },
    log: (...a) => logs.push(a.join(' ')),
  });
  return { client, slept, requests, logs, token: () => stored, now: () => now };
}

describe('Strava client', () => {
  it('sends the bearer token and query, returns JSON, reports usage from the read-limit headers', async () => {
    const { client, requests } = setup([json({ id: 1 }, { usage: '12,345', limit: '200,2000' })]);
    expect(await client.get('/athlete/activities', { per_page: 200, after: null })).toEqual({ id: 1 });
    expect(requests).toEqual([{ url: 'https://www.strava.com/api/v3/athlete/activities?per_page=200', auth: 'Bearer old', body: null }]);
    expect(client.usage()).toEqual({ calls: 1, short: 12, daily: 345, shortLimit: 200, dailyLimit: 2000 });
  });

  it('returns null on 404 and throws on other client errors', async () => {
    const { client } = setup([json({}, { status: 404 }), new Response('forbidden', { status: 403 })]);
    expect(await client.get('/activities/1/streams')).toBeNull();
    await expect(client.get('/activities/2')).rejects.toThrow('Strava 403 on /activities/2: forbidden');
  });

  it('pauses until the next 15-minute window (+5 s) once the short window is used up', async () => {
    const { client, slept, requests } = setup([json([], { usage: '99,10' }), json({ ok: true }, { usage: '1,11' })]);
    await client.get('/a');
    expect(slept).toEqual([]);
    expect(await client.get('/b')).toEqual({ ok: true });
    expect(slept).toEqual([(7 * 60 + 35) * 1000]); // 12:07:30 → 12:15:05
    expect(requests).toHaveLength(2);
  });

  it('on 429 waits for the next window and retries the same request', async () => {
    const { client, slept, requests } = setup([json({}, { status: 429, usage: '100,10' }), json({ ok: true })]);
    expect(await client.get('/a')).toEqual({ ok: true });
    expect(slept).toEqual([(7 * 60 + 35) * 1000]);
    expect(requests.map((r) => r.url)).toEqual(['https://www.strava.com/api/v3/a', 'https://www.strava.com/api/v3/a']);
    expect(client.usage().calls).toBe(2);
  });

  it('stops at the daily limit with a daily-limit error, without another request', async () => {
    const { client, requests, slept } = setup([json([], { usage: '5,999' })]);
    await client.get('/a');
    const error = await client.get('/b').catch((e) => e);
    expect(client.isDailyLimit(error)).toBe(true);
    expect(client.isDailyLimit(new Error('other'))).toBe(false);
    expect(requests).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it('a 429 at the daily limit is a daily-limit error, too', async () => {
    const { client } = setup([json({}, { status: 429, usage: '5,1000' })]);
    expect(client.isDailyLimit(await client.get('/a').catch((e) => e))).toBe(true);
  });

  it('with wait, sleeps until 00:01 UTC and continues with fresh counters', async () => {
    const { client, slept, now } = setup([json([], { usage: '5,999' }), json({ ok: true }, { usage: '1,1' })]);
    await client.get('/a', {}, { wait: true });
    expect(await client.get('/b', {}, { wait: true })).toEqual({ ok: true });
    expect(slept).toEqual([Date.parse('2024-05-02T00:01:00Z') - NOW]);
    expect(now()).toBe(Date.parse('2024-05-02T00:01:00Z'));
    expect(client.usage()).toMatchObject({ daily: 1, short: 1 });
  });

  it('refreshes the token on 401, stores it and retries with the new token', async () => {
    const fresh = { access_token: 'new', refresh_token: 'r2', expires_at: NOW / 1000 + 7200, athlete: { id: 9 } };
    const { client, requests, token } = setup([json({}, { status: 401 }), json(fresh), json({ ok: true })]);
    expect(await client.get('/a')).toEqual({ ok: true });
    expect(requests[1].url).toBe('https://www.strava.com/oauth/token');
    expect(new URLSearchParams(requests[1].body).get('refresh_token')).toBe('r1');
    expect(requests[2].auth).toBe('Bearer new');
    expect(token()).toMatchObject({ access_token: 'new', refresh_token: 'r2', athlete_id: 9 });
  });

  it('refreshes a token that expires within two minutes before the request', async () => {
    const fresh = { access_token: 'new', refresh_token: 'r2', expires_at: NOW / 1000 + 7200 };
    const { client, requests } = setup([json(fresh), json({ ok: true })], { token: { access_token: 'old', refresh_token: 'r1', expires_at: NOW / 1000 + 60 } });
    await client.get('/a');
    expect(requests.map((r) => r.auth)).toEqual([null, 'Bearer new']);
  });

  it('without a stored token asks to run strava:auth', async () => {
    const { client, requests, slept } = setup([], { token: null });
    await expect(client.get('/a')).rejects.toThrow('npm run strava:auth');
    expect(requests).toEqual([]);
    expect(slept).toEqual([]);
  });

  describe('token refresh', () => {
    const expiring = { access_token: 'old', refresh_token: 'r1', expires_at: NOW / 1000 + 60 };
    const fresh = { access_token: 'new', refresh_token: 'r2', expires_at: NOW / 1000 + 7200 };

    it('retries network errors and 5xx of the refresh with the same growing pauses', async () => {
      const { client, requests, slept, token } = setup(
        [new TypeError('socket hang up'), json({}, { status: 503 }), json(fresh), json({ ok: true })], { token: expiring },
      );
      expect(await client.get('/a')).toEqual({ ok: true });
      expect(slept).toEqual([5000, 8000]);
      expect(requests.map((r) => r.url)).toEqual([
        'https://www.strava.com/oauth/token', 'https://www.strava.com/oauth/token', 'https://www.strava.com/oauth/token',
        'https://www.strava.com/api/v3/a',
      ]);
      expect(requests.slice(0, 3).map((r) => new URLSearchParams(r.body).get('refresh_token'))).toEqual(['r1', 'r1', 'r1']);
      expect(requests[3].auth).toBe('Bearer new');
      expect(token()).toMatchObject({ access_token: 'new', refresh_token: 'r2' });
    });

    it('retries a network error of the refresh after a 401, too', async () => {
      const { client, requests, slept } = setup([json({}, { status: 401 }), new TypeError('ECONNRESET'), json(fresh), json({ ok: true })]);
      expect(await client.get('/a')).toEqual({ ok: true });
      expect(slept).toEqual([5000]);
      expect(requests.map((r) => r.auth)).toEqual(['Bearer old', null, null, 'Bearer new']);
    });

    it('fails at once with Strava\'s message when the refresh is rejected (4xx)', async () => {
      const { client, requests, slept } = setup([new Response('invalid refresh token', { status: 400 })], { token: expiring });
      await expect(client.get('/a')).rejects.toThrow('Strava token error 400: invalid refresh token');
      expect(requests).toHaveLength(1);
      expect(slept).toEqual([]);
    });

    it('gives up after 8 failed refresh attempts without retrying the whole request', async () => {
      const { client, requests, slept } = setup(Array.from({ length: 8 }, () => new TypeError('offline')), { token: expiring });
      await expect(client.get('/a')).rejects.toThrow('Too many failed attempts: token refresh');
      expect(requests).toHaveLength(8);
      expect(slept).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => 5000 * n));
    });
  });

  it('retries 5xx and network errors with growing pauses, then gives up after 8 attempts', async () => {
    const { client, slept } = setup([json({}, { status: 502 }), new TypeError('socket hang up'), json({ ok: true })]);
    expect(await client.get('/a')).toEqual({ ok: true });
    expect(slept).toEqual([4000, 10000]);

    const failing = setup(Array.from({ length: 8 }, () => json({}, { status: 500 })));
    await expect(failing.client.get('/b')).rejects.toThrow('Too many failed attempts: /b');
    expect(failing.slept).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => 4000 * n));
  });
});
