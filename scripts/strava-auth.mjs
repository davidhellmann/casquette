#!/usr/bin/env node
/**
 * One-time Strava connection (OAuth). Opens the browser, catches the callback on localhost
 * and stores the token in .strava-token.json (refreshed automatically).
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { loadEnv } from './lib/env.mjs';
import { exchangeToken } from './lib/strava.mjs';

loadEnv();
const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('❌ Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env (see README).');
  process.exit(1);
}
const PORT = Number(process.env.STRAVA_AUTH_PORT) || 8723;
const redirect = `http://localhost:${PORT}/callback`;
const SCOPE = 'read,activity:read_all,profile:read_all';
const url = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(id)}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&approval_prompt=force&scope=${SCOPE}`;

const page = (title, msg) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0b0d12;color:#eef1f6"><div style="text-align:center"><h2>${title}</h2><p style="color:#8890a3">${msg}</p></div>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  const scope = u.searchParams.get('scope') || '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (!code) {
    res.end(page('Cancelled', u.searchParams.get('error') || 'No code received.'));
    console.error('❌ Authorization cancelled.');
    return finish(1);
  }
  try {
    const t = await exchangeToken({ code, grant_type: 'authorization_code', scope });
    res.end(page('✅ Connected to Strava', 'You can close this window.'));
    console.log(`✅ Connected (athlete ${t.athlete_id}). Scopes: ${scope}`);
    if (!scope.includes('activity:read_all')) console.warn('⚠️  "activity:read_all" was not granted – private activities will be missing.');
    if (!scope.includes('profile:read_all')) console.warn('⚠️  "profile:read_all" was not granted – zones and gear may be incomplete.');
    console.log('\nNext:  npm run sync');
    finish(0);
  } catch (e) {
    res.end(page('Error', e.message));
    console.error('❌', e.message);
    finish(1);
  }
});
/** Opens the URL in the default browser (macOS, Windows, Linux/BSD); the printed URL is the fallback. */
function openBrowser(target) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [target]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${target}"`]]
      : ['xdg-open', [target]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' });
    child.on('error', () => {}); // no opener available: the URL above is enough
    child.unref();
  } catch {}
}
function finish(code) { setTimeout(() => { server.close(); process.exit(code); }, 300); }

server.listen(PORT, () => {
  console.log('Opening Strava in the browser …\nIf nothing happens, open this URL:\n' + url + '\n');
  openBrowser(url);
});
