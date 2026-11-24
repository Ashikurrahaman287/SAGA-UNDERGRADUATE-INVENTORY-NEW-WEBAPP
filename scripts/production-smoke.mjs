import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const staticOnly = process.env.SMOKE_STATIC_ONLY === '1';
const failures = [];

function check(condition, message) {
  if (condition) globalThis.console.log(`PASS ${message}`);
  else failures.push(message);
}

async function request(route, options) {
  return globalThis.fetch(new globalThis.URL(route, baseUrl), options);
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const value = headers.get('set-cookie');
  return value ? [value] : [];
}

function updateCookieJar(jar, values) {
  for (const header of values) {
    const [cookie] = header.split(';');
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    const name = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1);
    if (/max-age=0/i.test(header) || /expires=Thu, 01 Jan 1970/i.test(header)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function bundleChecks() {
  const assetRoot = path.resolve('dist', 'assets');
  let names;
  try {
    names = await readdir(assetRoot);
  } catch {
    check(false, 'production dist/assets exists; run npm run build first');
    return;
  }
  const textFiles = [
    'dist/index.html',
    ...names.filter((name) => /\.(js|css)$/.test(name)).map((name) => path.join(assetRoot, name)),
  ];
  const forbidden = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE',
    'SWIFTSMS_API_KEY',
    'ADMIN_PASSWORD',
    'MOD_PASSWORD',
    'RIDER_PASSWORD',
    'localhost:',
    '127.0.0.1:',
    'test@example.com',
  ];
  const findings = [];
  for (const file of textFiles) {
    const content = await readFile(file, 'utf8');
    for (const needle of forbidden) {
      if (content.toLowerCase().includes(needle.toLowerCase())) findings.push(`${file}: ${needle}`);
    }
  }
  check(
    findings.length === 0,
    findings.length
      ? `client bundle contains forbidden strings: ${findings.join('; ')}`
      : 'production bundles contain no server secrets, local URLs, or debug identities',
  );
  for (const chunk of [
    'DashboardPage',
    'CommunicationsPage',
    'SettingsPage',
    'UsersPage',
    'AuditLogsPage',
  ]) {
    check(
      names.some((name) => name.startsWith(`${chunk}-`)),
      `${chunk} is emitted as a route-level chunk`,
    );
  }
}

async function staticHttpChecks() {
  const home = await request('/');
  const homeHtml = await home.text();
  check(home.status === 200 && /<html[\s>]/i.test(homeHtml), 'homepage returns valid HTML');
  for (const route of [
    '/app/dashboard',
    '/app/communications',
    '/app/settings',
    '/app/users',
    '/app/audit-logs',
  ]) {
    const response = await request(route);
    const html = await response.text();
    check(response.status === 200 && /<html[\s>]/i.test(html), `SPA refresh works for ${route}`);
  }
}

async function apiChecks() {
  const health = await request('/api/health');
  const healthJson = await health.json().catch(() => null);
  check(health.status === 200 && healthJson?.status === 'ok', '/api/health returns HTTP 200 JSON');

  const readiness = await request('/api/ready');
  const readinessText = await readiness.text();
  const readinessJson = JSON.parse(readinessText);
  check(
    [200, 503].includes(readiness.status) && ['ready', 'not_ready'].includes(readinessJson.status),
    '/api/ready reports database/configuration readiness',
  );
  check(
    !/postgres(ql)?:\/\/|service_role_key|apikey=/i.test(readinessText),
    'readiness response does not reveal connection details',
  );
  if (process.env.SMOKE_REQUIRE_READY === '1')
    check(readiness.status === 200, 'release target is database-ready');

  const authStatus = await request('/api/auth/me');
  const authJson = await authStatus.json().catch(() => null);
  check(
    authStatus.status === 200 && authJson?.authenticated === false,
    'anonymous auth status returns 200 and authenticated=false',
  );

  const protectedSettings = await request('/api/settings');
  check([401, 403].includes(protectedSettings.status), 'unauthenticated settings API is rejected');
}

async function credentialedCookieChecks() {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (!email || !password) {
    globalThis.console.log(
      'SKIP credentialed login/logout checks (SMOKE_EMAIL and SMOKE_PASSWORD are not configured)',
    );
    return;
  }
  const origin = new globalThis.URL(baseUrl).origin;
  const jar = new Map();
  const csrfResponse = await request('/api/auth/csrf', { headers: { Origin: origin } });
  updateCookieJar(jar, setCookies(csrfResponse.headers));
  const csrfBody = await csrfResponse.json();
  check(
    csrfResponse.status === 200 && typeof csrfBody.csrfToken === 'string',
    'CSRF token established for login',
  );
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookieHeader(),
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfBody.csrfToken,
    },
    body: JSON.stringify({ email, password, role: process.env.SMOKE_ROLE || 'admin' }),
  });
  const loginCookies = setCookies(login.headers);
  updateCookieJar(jar, loginCookies);
  const authenticatedCookies = loginCookies.filter((cookie) => /^(sb-|saga_org_id=)/i.test(cookie));
  check(
    login.ok && authenticatedCookies.length > 0,
    'credentialed login establishes an authenticated session',
  );
  check(
    authenticatedCookies.every((cookie) => /httponly/i.test(cookie)),
    'session and organization cookies are HttpOnly',
  );
  if (new globalThis.URL(baseUrl).protocol === 'https:')
    check(
      authenticatedCookies.every((cookie) => /secure/i.test(cookie)),
      'session cookies are Secure over HTTPS',
    );
  check(
    authenticatedCookies.every((cookie) => /samesite=lax/i.test(cookie)),
    'session cookies use SameSite=Lax',
  );
  const logout = await request('/api/auth/logout', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookieHeader(),
      'X-CSRF-Token': csrfBody.csrfToken,
    },
  });
  const logoutCookies = setCookies(logout.headers);
  check(
    logout.ok && logoutCookies.some((cookie) => /max-age=0/i.test(cookie)),
    'logout expires session cookies',
  );
}

await bundleChecks();
try {
  await staticHttpChecks();
  if (staticOnly) {
    globalThis.console.log('SKIP API smoke checks (SMOKE_STATIC_ONLY=1)');
  } else {
    await apiChecks();
    await credentialedCookieChecks();
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : 'Smoke request failed.');
}

if (failures.length) {
  for (const failure of failures) globalThis.console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  globalThis.console.log('Production smoke checks passed.');
}
