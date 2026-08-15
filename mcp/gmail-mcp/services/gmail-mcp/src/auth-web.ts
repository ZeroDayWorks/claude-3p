#!/usr/bin/env node
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createOAuth2Client, loadClientSecrets, loadToken, saveToken } from "./auth.js";
import { loadConfig } from "./config.js";

interface PendingAuthorization {
  oauth: ReturnType<typeof createOAuth2Client>;
  expiresAt: number;
}

const HTML = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gmail MCP • Connection</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f3f7ff; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; padding: 42px 18px; background: radial-gradient(circle at 10% 0%, #dceaff 0, transparent 34%), linear-gradient(145deg, #f7fbff, #eef3ff); }
    main { max-width: 680px; margin: 0 auto; overflow: hidden; border: 1px solid #d9e3f3; border-radius: 24px; background: rgba(255,255,255,.9); box-shadow: 0 22px 65px #375a991f; }
    .hero { display: flex; align-items: center; gap: 16px; padding: 30px 30px 24px; background: linear-gradient(135deg, #ffffff, #edf5ff); border-bottom: 1px solid #e2eaf6; }
    .logo { display: grid; width: 62px; height: 62px; place-items: center; border-radius: 18px; background: linear-gradient(135deg, #eaf3ff, #d7e8ff); font-size: 32px; box-shadow: inset 0 1px #fff, 0 8px 20px #5b8ed333; }
    h1 { margin: 0; color: #13264a; font-size: 1.7rem; letter-spacing: -.03em; }
    .subtitle { margin: 5px 0 0; color: #5e6f89; font-size: .95rem; }
    .content { padding: 26px 30px 30px; }
    .status-card { padding: 18px; border: 1px solid #e1e9f5; border-radius: 16px; background: #fbfdff; }
    .status-head, .metric { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .status-head { margin-bottom: 15px; }
    .label { color: #6c7b91; font-size: .88rem; }
    .value { color: #1d2d49; font-weight: 650; text-align: right; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 999px; font-size: .82rem; font-weight: 750; white-space: nowrap; }
    .badge.neutral { color: #53657e; background: #edf2f8; }
    .badge.success { color: #13734a; background: #dcf8e9; }
    .badge.warning { color: #956100; background: #fff1c9; }
    .badge.danger { color: #a33b3b; background: #ffe1e1; }
    .metrics { display: grid; gap: 11px; padding-top: 14px; border-top: 1px solid #e9eef6; }
    .metric { align-items: flex-start; }
    .metric-icon { width: 25px; font-size: 1.05rem; }
    .metric-copy { display: flex; flex: 1; flex-direction: column; gap: 2px; }
    .metric .value { font-size: .91rem; font-weight: 600; }
    .alert { margin-top: 14px; padding: 12px 14px; border: 1px solid #ffcaca; border-radius: 12px; color: #963e3e; background: #fff3f3; font-size: .9rem; }
    .hidden { display: none; }
    button { width: 100%; margin-top: 20px; cursor: pointer; border: 0; border-radius: 12px; padding: 13px 16px; color: white; background: linear-gradient(135deg, #287bea, #145bd2); box-shadow: 0 9px 18px #246bd333; font-size: 1rem; font-weight: 750; transition: transform .15s, box-shadow .15s; }
    button:hover { transform: translateY(-1px); box-shadow: 0 12px 22px #246bd344; }
    button:disabled { opacity: .65; cursor: wait; transform: none; }
    .footnote { margin: 18px 2px 0; color: #718098; font-size: .84rem; text-align: center; }
    @media (max-width: 520px) { body { padding: 18px 10px; } .hero, .content { padding-left: 20px; padding-right: 20px; } .hero { align-items: flex-start; } .status-head, .metric { align-items: flex-start; flex-direction: column; gap: 7px; } .value { text-align: left; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="logo">📬</div>
      <div>
        <h1>Gmail MCP</h1>
        <p class="subtitle">จัดการการเชื่อมต่อ Gmail สำหรับเครื่องนี้เท่านั้น</p>
      </div>
    </section>
    <section class="content">
      <div class="status-card">
        <div class="status-head">
          <span class="label">สถานะการเชื่อมต่อ</span>
          <span id="connectionBadge" class="badge neutral">⏳ กำลังตรวจสอบ...</span>
        </div>
        <div class="metrics">
          <div class="metric"><span class="metric-icon">🔑</span><span class="metric-copy"><span class="label">Access token หมดอายุ</span><span id="expiresAt" class="value">กำลังตรวจสอบ...</span></span><span id="accessBadge" class="badge neutral">...</span></div>
          <div class="metric"><span class="metric-icon">⏱️</span><span class="metric-copy"><span class="label">อายุคงเหลือ</span><span id="expiresIn" class="value">กำลังคำนวณ...</span></span></div>
          <div class="metric"><span class="metric-icon">♻️</span><span class="metric-copy"><span class="label">Refresh token</span><span id="refreshStatus" class="value">กำลังตรวจสอบ...</span></span><span id="refreshBadge" class="badge neutral">...</span></div>
          <div class="metric"><span class="metric-icon">🛡️</span><span class="metric-copy"><span class="label">Scope</span><span id="scope" class="value">กำลังตรวจสอบ...</span></span></div>
        </div>
        <div id="alert" class="alert hidden"></div>
      </div>
      <button id="login" type="button">🔐 Re-login with Google</button>
      <p class="footnote">🔒 token ถูกเก็บไว้ฝั่ง Docker เท่านั้น หน้านี้จะไม่แสดงค่า token จริง</p>
    </section>
  </main>
  <script>
    const button = document.querySelector('#login');
    const connectionBadge = document.querySelector('#connectionBadge');
    const accessBadge = document.querySelector('#accessBadge');
    const refreshBadge = document.querySelector('#refreshBadge');
    const expiresAt = document.querySelector('#expiresAt');
    const expiresIn = document.querySelector('#expiresIn');
    const refreshStatus = document.querySelector('#refreshStatus');
    const scope = document.querySelector('#scope');
    const alert = document.querySelector('#alert');
    function badge(element, kind, text) {
      element.className = 'badge ' + kind;
      element.textContent = text;
    }
    function formatRemaining(seconds) {
      if (typeof seconds !== 'number') return 'ไม่ทราบ';
      if (seconds <= 0) return 'หมดอายุแล้ว';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return hours + ' ชม. ' + minutes + ' นาที ' + secs + ' วินาที';
    }
    function formatDate(value) {
      if (!value) return 'ไม่ทราบ';
      return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
    }
    async function refreshStatus() {
      const response = await fetch('/api/status');
      const data = await response.json();
      if (!data.authorized) {
        badge(connectionBadge, 'danger', '🔴 ยังไม่ได้เชื่อมต่อ');
        badge(accessBadge, 'neutral', 'ไม่มี');
        badge(refreshBadge, 'danger', 'ไม่มี');
        expiresAt.textContent = 'ไม่พบ token';
        expiresIn.textContent = '—';
        refreshStatus.textContent = 'กรุณา Login';
        scope.textContent = '—';
        alert.className = 'alert';
        alert.textContent = 'กรุณากดปุ่ม Re-login เพื่อเชื่อมต่อ Gmail';
        return;
      }
      const accessExpired = typeof data.accessTokenExpiresInSeconds === 'number' && data.accessTokenExpiresInSeconds <= 0;
      badge(connectionBadge, data.refreshError ? 'warning' : 'success', data.refreshError ? '🟡 ต้อง Re-login' : '🟢 เชื่อมต่อแล้ว');
      badge(accessBadge, accessExpired ? 'warning' : 'success', accessExpired ? 'หมดอายุ' : 'ใช้งานได้');
      badge(refreshBadge, data.hasRefreshToken && !data.refreshError ? 'success' : 'danger', data.hasRefreshToken && !data.refreshError ? 'พร้อม Auto-refresh' : 'ต้อง Re-login');
      expiresAt.textContent = formatDate(data.accessTokenExpiresAt);
      expiresIn.textContent = formatRemaining(data.accessTokenExpiresInSeconds);
      refreshStatus.textContent = data.hasRefreshToken ? 'มี — ใช้ต่ออายุอัตโนมัติ' : 'ไม่มี';
      scope.textContent = data.scope || 'ไม่ระบุ';
      if (data.refreshError) {
        alert.className = 'alert';
        alert.textContent = '⚠️ Google ตอบกลับ ' + data.refreshError + ' กรุณากด Re-login เพื่อสร้างการเชื่อมต่อใหม่';
      } else {
        alert.className = 'alert hidden';
        alert.textContent = '';
      }
    }
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'กำลังเปิด Google...';
      window.location.href = '/login';
    });
    refreshStatus().catch(() => { badge(connectionBadge, 'danger', '🔴 ตรวจสอบไม่สำเร็จ'); });
    setInterval(() => { refreshStatus().catch(() => undefined); }, 30000);
  </script>
</body>
</html>`;

function send(response: http.ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const secrets = await loadClientSecrets(config.credentialsPath);
  const bind = process.env.OAUTH_CALLBACK_BIND ?? "127.0.0.1";
  const port = Number.parseInt(process.env.OAUTH_CALLBACK_PORT ?? "3101", 10);
  const redirectHost = process.env.OAUTH_REDIRECT_HOST ?? "localhost";
  const redirectUri = `http://${redirectHost}:${port}/oauth2callback`;
  const pending = new Map<string, PendingAuthorization>();

  async function getTokenStatus() {
    let token = await loadToken(config.tokenPath).catch(() => undefined);
    if (!token) return { authorized: false };

    // Refresh shortly before expiry so the status page shows a live lifetime,
    // even when the Gmail MCP has not made an API request yet.
    let refreshError: string | undefined;
    const shouldRefresh = Boolean(token.refresh_token)
      && (!token.expiry_date || token.expiry_date <= Date.now() + 60_000);
    if (shouldRefresh) {
      try {
        const oauth = createOAuth2Client(secrets);
        oauth.setCredentials(token);
        await oauth.getAccessToken();
        token = { ...token, ...oauth.credentials };
        await saveToken(config.tokenPath, token);
      } catch (error) {
        refreshError = error instanceof Error ? error.message : String(error);
        console.error(`Unable to refresh Gmail token for status: ${refreshError}`);
      }
    }

    const expiryDate = typeof token.expiry_date === "number" ? token.expiry_date : undefined;
    return {
      authorized: Boolean(token.refresh_token || token.access_token),
      hasAccessToken: Boolean(token.access_token),
      hasRefreshToken: Boolean(token.refresh_token),
      accessTokenExpiresAt: expiryDate ? new Date(expiryDate).toISOString() : undefined,
      accessTokenExpiresInSeconds: expiryDate ? Math.floor((expiryDate - Date.now()) / 1000) : undefined,
      refreshError,
      scope: token.scope,
    };
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${redirectHost}:${port}`);

    if (request.method === "GET" && url.pathname === "/") {
      send(response, 200, HTML, "text/html; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      send(response, 200, JSON.stringify(await getTokenStatus()), "application/json; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/login") {
      const oauth = createOAuth2Client(secrets, redirectUri);
      const state = randomBytes(24).toString("base64url");
      pending.set(state, { oauth, expiresAt: Date.now() + 5 * 60 * 1000 });
      const authUrl = oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: config.scopes,
        state,
      });
      response.writeHead(302, { Location: authUrl, "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/oauth2callback") {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const authorization = state ? pending.get(state) : undefined;
      if (state) pending.delete(state);

      if (!authorization || authorization.expiresAt < Date.now()) {
        send(response, 400, "OAuth session expired. Return to http://localhost:3101 and try again.");
        return;
      }
      if (error || !code) {
        send(response, 400, `Google authorization failed: ${error ?? "missing authorization code"}`);
        return;
      }

      try {
        const previous = await loadToken(config.tokenPath).catch(() => ({}));
        const { tokens } = await authorization.oauth.getToken(code);
        // Google may omit refresh_token on a subsequent authorization. Keep
        // the previous one so a successful re-login never breaks refresh.
        await saveToken(config.tokenPath, { ...previous, ...tokens });
        send(response, 200, "<!doctype html><meta charset=\"utf-8\"><title>Gmail connected</title><p>Gmail authorization complete.</p><p><a href=\"/\">กลับไปหน้า Gmail MCP</a></p>", "text/html; charset=utf-8");
      } catch (cause) {
        console.error("Gmail OAuth callback failed", cause);
        send(response, 500, "Unable to save Gmail authorization. Check the container logs.");
      }
      return;
    }

    send(response, 404, "Not found");
  });

  const cleanupTimer = setInterval(() => {
    for (const [state, authorization] of pending) {
      if (authorization.expiresAt < Date.now()) pending.delete(state);
    }
  }, 60_000);
  const shutdown = () => {
    clearInterval(cleanupTimer);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.listen(port, bind, () => {
    console.log(`Gmail auth web UI: http://localhost:${port}`);
    console.log(`OAuth redirect URI: ${redirectUri}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
