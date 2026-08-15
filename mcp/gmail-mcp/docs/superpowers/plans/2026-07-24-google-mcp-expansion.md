# Google MCP Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sheets, Docs, Drive (combined as workspace-mcp) and Google Maps (maps-mcp) to the existing google-workspace-mcp monorepo, with a shared google-auth package.

**Architecture:** npm workspaces monorepo. A shared `packages/google-auth` library provides OAuth2 flow, token refresh, MCP server factory, and reusable auth CLI. `workspace-mcp` combines Sheets/Docs/Drive tools sharing one OAuth token. `maps-mcp` uses API Key primarily with optional OAuth.

**Tech Stack:** TypeScript 5.9+, Node 22, @modelcontextprotocol/sdk ^1.29, googleapis ^173, zod ^4, express ^5, vitest ^3, Docker (node:22-bookworm-slim)

## Global Constraints

- Node >= 20 (runtime target Node 22)
- ESM only (`"type": "module"`)
- TypeScript strict mode, target ES2022, module NodeNext
- All services support both stdio (`npm start`) and Streamable HTTP (`npm run start:http`)
- Ports: workspace-mcp → 127.0.0.1:3003, maps-mcp → 127.0.0.1:3004
- OAuth credentials: Desktop app type, stored in `secrets/credentials.json`
- workspace-mcp token: `secrets/workspace-token.json` (scopes: spreadsheets, documents, drive)
- maps-mcp: env `MAPS_API_KEY` (primary), optional OAuth via `secrets/maps-token.json`
- No comments in code unless explicitly requested
- Follow existing gmail-mcp patterns (result/failure/safe helpers, registerTool style)

---

## File Structure

```
google-workspace-mcp/
├── package.json                          # MODIFY: add workspaces field
├── compose.yaml                          # MODIFY: add workspace-mcp, maps-mcp, auth profiles
├── packages/
│   └── google-auth/
│       ├── package.json                  # CREATE
│       ├── tsconfig.json                 # CREATE
│       └── src/
│           ├── index.ts                  # CREATE: re-exports
│           ├── oauth.ts                  # CREATE: OAuth2 client, token load/refresh/save
│           ├── oauth.test.ts             # CREATE
│           ├── mcp-factory.ts            # CREATE: createMcpServer, startHttp, startStdio
│           ├── mcp-factory.test.ts       # CREATE
│           ├── auth-cli.ts              # CREATE: reusable auth CLI runner
│           └── config.ts                 # CREATE: shared config types
├── services/
│   ├── workspace-mcp/
│   │   ├── package.json                  # CREATE
│   │   ├── tsconfig.json                 # CREATE
│   │   ├── Dockerfile                    # CREATE
│   │   ├── .dockerignore                 # CREATE
│   │   ├── .env.example                  # CREATE
│   │   └── src/
│   │       ├── index.ts                  # CREATE: stdio entry
│   │       ├── http.ts                   # CREATE: HTTP entry
│   │       ├── config.ts                 # CREATE
│   │       ├── server.ts                 # CREATE: register all tools
│   │       ├── server.test.ts            # CREATE
│   │       ├── sheets-service.ts         # CREATE
│   │       ├── sheets-service.test.ts    # CREATE
│   │       ├── docs-service.ts           # CREATE
│   │       ├── docs-service.test.ts      # CREATE
│   │       ├── drive-service.ts          # CREATE
│   │       └── drive-service.test.ts     # CREATE
│   └── maps-mcp/
│       ├── package.json                  # CREATE
│       ├── tsconfig.json                 # CREATE
│       ├── Dockerfile                    # CREATE
│       ├── .dockerignore                 # CREATE
│       ├── .env.example                  # CREATE
│       └── src/
│           ├── index.ts                  # CREATE: stdio entry
│           ├── http.ts                   # CREATE: HTTP entry
│           ├── config.ts                 # CREATE
│           ├── server.ts                 # CREATE: register all tools
│           ├── server.test.ts            # CREATE
│           ├── maps-service.ts           # CREATE
│           └── maps-service.test.ts      # CREATE
```

---

### Task 1: npm Workspaces Setup + google-auth Package Scaffold

**Files:**
- Modify: `package.json` (root)
- Create: `packages/google-auth/package.json`
- Create: `packages/google-auth/tsconfig.json`
- Create: `packages/google-auth/src/index.ts`

**Interfaces:**
- Produces: npm workspace resolution for `@google-workspace/auth` package

- [ ] **Step 1: Add workspaces to root package.json**

```json
{
  "name": "google-workspace-mcp",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "check": "npm run check --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Create packages/google-auth/package.json**

```json
{
  "name": "@google-workspace/auth",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "express": "^5.2.1",
    "googleapis": "^173.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/express": "^5.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  },
  "overrides": {
    "google-auth-library": "10.5.0"
  }
}
```

- [ ] **Step 3: Create packages/google-auth/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 4: Create packages/google-auth/src/index.ts (placeholder)**

```ts
export {};
```

- [ ] **Step 5: Install workspace dependencies**

Run: `npm install`
Expected: workspace links created, no errors

- [ ] **Step 6: Verify build**

Run: `npm run build --workspace=@google-workspace/auth`
Expected: compiles without errors, `dist/index.js` created

- [ ] **Step 7: Commit**

```bash
git add package.json packages/
git commit -m "chore: add npm workspaces and google-auth package scaffold"
```

---

### Task 2: google-auth OAuth Module

**Files:**
- Create: `packages/google-auth/src/config.ts`
- Create: `packages/google-auth/src/oauth.ts`
- Create: `packages/google-auth/src/oauth.test.ts`
- Modify: `packages/google-auth/src/index.ts`

**Interfaces:**
- Produces: `loadClientSecrets(path)`, `createOAuth2Client(config)`, `loadOrRefreshToken(config)`, `saveToken(path, credentials)`, `AuthConfig` type

- [ ] **Step 1: Write the failing test for loadClientSecrets**

```ts
// packages/google-auth/src/oauth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadClientSecrets, saveToken } from "./oauth.js";

describe("loadClientSecrets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });

  it("reads installed client credentials", async () => {
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({
      installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] }
    }));
    const result = await loadClientSecrets(path);
    expect(result).toEqual({ client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] });
  });

  it("reads web client credentials", async () => {
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({
      web: { client_id: "wid", client_secret: "wsecret" }
    }));
    const result = await loadClientSecrets(path);
    expect(result.client_id).toBe("wid");
  });

  it("throws on missing client_id", async () => {
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({ installed: { client_secret: "s" } }));
    await expect(loadClientSecrets(path)).rejects.toThrow("client_id");
  });

  it("throws on missing file", async () => {
    await expect(loadClientSecrets(join(dir, "nope.json"))).rejects.toThrow("Unable to read");
  });
});

describe("saveToken", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });

  it("writes token as formatted JSON", async () => {
    const path = join(dir, "token.json");
    await saveToken(path, { access_token: "abc", refresh_token: "def" });
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(path, "utf8");
    expect(JSON.parse(content)).toEqual({ access_token: "abc", refresh_token: "def" });
  });

  it("cleans up", async () => {
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@google-workspace/auth`
Expected: FAIL — cannot find module `./oauth.js`

- [ ] **Step 3: Create packages/google-auth/src/config.ts**

```ts
export interface AuthConfig {
  credentialsPath: string;
  tokenPath: string;
  scopes: string[];
}
```

- [ ] **Step 4: Create packages/google-auth/src/oauth.ts**

```ts
import { readFile, writeFile } from "node:fs/promises";
import { google, type Auth } from "googleapis";
import type { AuthConfig } from "./config.js";

interface ClientSecrets {
  installed?: OAuthClientConfig;
  web?: OAuthClientConfig;
}

export interface OAuthClientConfig {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read JSON file ${filePath}: ${detail}`);
  }
}

export async function loadClientSecrets(credentialsPath: string): Promise<OAuthClientConfig> {
  const secrets = await readJson<ClientSecrets>(credentialsPath);
  const client = secrets.installed ?? secrets.web;
  if (!client?.client_id || !client.client_secret) {
    throw new Error("OAuth credentials must contain an installed or web client with client_id and client_secret");
  }
  return client;
}

export function createOAuth2Client(clientConfig: OAuthClientConfig, redirectUri?: string): Auth.OAuth2Client {
  return new google.auth.OAuth2(clientConfig.client_id, clientConfig.client_secret, redirectUri);
}

export async function loadOrRefreshToken(config: AuthConfig): Promise<Auth.OAuth2Client> {
  const clientConfig = await loadClientSecrets(config.credentialsPath);
  const oauth = createOAuth2Client(clientConfig);
  const token = await readJson<Auth.Credentials>(config.tokenPath);
  oauth.setCredentials(token);
  oauth.on("tokens", async (newTokens) => {
    const merged = { ...oauth.credentials, ...newTokens };
    await saveToken(config.tokenPath, merged);
  });
  return oauth;
}

export async function saveToken(tokenPath: string, credentials: Auth.Credentials): Promise<void> {
  await writeFile(tokenPath, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
```

- [ ] **Step 5: Update packages/google-auth/src/index.ts**

```ts
export type { AuthConfig } from "./config.js";
export type { OAuthClientConfig } from "./oauth.js";
export { loadClientSecrets, createOAuth2Client, loadOrRefreshToken, saveToken } from "./oauth.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --workspace=@google-workspace/auth`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/google-auth/src/
git commit -m "feat(auth): add OAuth2 client, token load/refresh/save"
```

---

### Task 3: google-auth MCP Server Factory

**Files:**
- Create: `packages/google-auth/src/mcp-factory.ts`
- Create: `packages/google-auth/src/mcp-factory.test.ts`
- Modify: `packages/google-auth/src/index.ts`

**Interfaces:**
- Produces: `createMcpServer(name, version)`, `startHttp(server, serviceName, port, host)`, `startStdio(server)`

- [ ] **Step 1: Write the failing test**

```ts
// packages/google-auth/src/mcp-factory.test.ts
import { describe, it, expect } from "vitest";
import { createMcpServer } from "./mcp-factory.js";

describe("createMcpServer", () => {
  it("creates an McpServer with given name and version", () => {
    const server = createMcpServer("test-server", "1.0.0");
    expect(server).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@google-workspace/auth`
Expected: FAIL — cannot find module `./mcp-factory.js`

- [ ] **Step 3: Create packages/google-auth/src/mcp-factory.ts**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export function createMcpServer(name: string, version: string): McpServer {
  return new McpServer({ name, version });
}

export async function startStdio(server: McpServer): Promise<void> {
  await server.connect(new StdioServerTransport());
}

export function startHttp(
  createServerFn: () => McpServer,
  serviceName: string,
  port: number,
  host: string = "0.0.0.0",
): void {
  const app = createMcpExpressApp({ host });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: serviceName });
  });

  app.post("/mcp", async (request, response) => {
    const server = createServerFn();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });

  app.all("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  });

  const httpServer = app.listen(port, host, () => {
    console.error(`${serviceName} listening on http://${host}:${port}/mcp`);
  });
  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
```

- [ ] **Step 4: Update packages/google-auth/src/index.ts**

```ts
export type { AuthConfig } from "./config.js";
export type { OAuthClientConfig } from "./oauth.js";
export { loadClientSecrets, createOAuth2Client, loadOrRefreshToken, saveToken } from "./oauth.js";
export { createMcpServer, startHttp, startStdio } from "./mcp-factory.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@google-workspace/auth`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/google-auth/src/
git commit -m "feat(auth): add MCP server factory with HTTP and stdio transports"
```

---

### Task 4: google-auth Reusable Auth CLI

**Files:**
- Create: `packages/google-auth/src/auth-cli.ts`
- Modify: `packages/google-auth/src/index.ts`

**Interfaces:**
- Produces: `runAuthFlow(options: RunAuthFlowOptions): Promise<void>`

- [ ] **Step 1: Create packages/google-auth/src/auth-cli.ts**

```ts
import http from "node:http";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadClientSecrets, createOAuth2Client, saveToken } from "./oauth.js";

export interface RunAuthFlowOptions {
  credentialsPath: string;
  tokenPath: string;
  scopes: string[];
  serviceName: string;
}

export async function runAuthFlow(options: RunAuthFlowOptions): Promise<void> {
  const { credentialsPath, tokenPath, scopes, serviceName } = options;
  const secrets = await loadClientSecrets(credentialsPath);
  const server = http.createServer();
  const callbackPort = Number.parseInt(process.env.OAUTH_CALLBACK_PORT ?? "0", 10);
  const callbackBind = process.env.OAUTH_CALLBACK_BIND ?? "127.0.0.1";
  const redirectHost = process.env.OAUTH_REDIRECT_HOST ?? "127.0.0.1";

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(callbackPort, callbackBind, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate OAuth callback port");
  const redirectUri = `http://${redirectHost}:${address.port}/oauth2callback`;
  const oauth = createOAuth2Client(secrets, redirectUri);
  const state = randomBytes(24).toString("base64url");
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
  });

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("OAuth authorization timed out after 5 minutes")), 5 * 60 * 1000);
    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", redirectUri);
      if (url.pathname !== "/oauth2callback") { response.writeHead(404).end(); return; }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      if (returnedState !== state) {
        response.writeHead(400, { "Content-Type": "text/plain" }).end("Authorization failed: invalid OAuth state");
        clearTimeout(timeout);
        reject(new Error("OAuth callback state did not match"));
      } else if (error || !code) {
        response.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${error ?? "missing code"}`);
        clearTimeout(timeout);
        reject(new Error(error ?? "OAuth callback did not contain a code"));
      } else {
        response.writeHead(200, { "Content-Type": "text/plain" }).end(`${serviceName} authorization complete. You can close this tab.`);
        clearTimeout(timeout);
        resolve(code);
      }
    });
  });

  console.log(`Open this URL to authorize ${serviceName}:\n${authUrl}`);
  const command = process.platform === "win32" ? ["cmd", ["/c", "start", "", authUrl]] as const
    : process.platform === "darwin" ? ["open", [authUrl]] as const
      : ["xdg-open", [authUrl]] as const;
  execFile(command[0], command[1], () => undefined);

  try {
    const code = await codePromise;
    const { tokens } = await oauth.getToken(code);
    await saveToken(tokenPath, tokens);
    console.log(`Saved OAuth token to ${tokenPath}`);
  } finally {
    server.close();
  }
}
```

- [ ] **Step 2: Update packages/google-auth/src/index.ts**

```ts
export type { AuthConfig } from "./config.js";
export type { OAuthClientConfig } from "./oauth.js";
export { loadClientSecrets, createOAuth2Client, loadOrRefreshToken, saveToken } from "./oauth.js";
export { createMcpServer, startHttp, startStdio } from "./mcp-factory.js";
export type { RunAuthFlowOptions } from "./auth-cli.js";
export { runAuthFlow } from "./auth-cli.js";
```

- [ ] **Step 3: Verify build**

Run: `npm run build --workspace=@google-workspace/auth`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add packages/google-auth/src/
git commit -m "feat(auth): add reusable auth CLI flow"
```

---

### Task 5: workspace-mcp Scaffold + Config

**Files:**
- Create: `services/workspace-mcp/package.json`
- Create: `services/workspace-mcp/tsconfig.json`
- Create: `services/workspace-mcp/Dockerfile`
- Create: `services/workspace-mcp/.dockerignore`
- Create: `services/workspace-mcp/.env.example`
- Create: `services/workspace-mcp/src/config.ts`
- Create: `services/workspace-mcp/src/index.ts`
- Create: `services/workspace-mcp/src/http.ts`

**Interfaces:**
- Consumes: `@google-workspace/auth` (loadOrRefreshToken, createMcpServer, startHttp, startStdio, AuthConfig)
- Produces: workspace-mcp service skeleton with stdio + HTTP entry points

- [ ] **Step 1: Create services/workspace-mcp/package.json**

```json
{
  "name": "workspace-mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "auth": "node dist/auth-cli.js",
    "build": "tsc -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "start": "node dist/index.js",
    "start:http": "node dist/http.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@google-workspace/auth": "*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "googleapis": "^173.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  },
  "overrides": {
    "google-auth-library": "10.5.0"
  }
}
```

- [ ] **Step 2: Create services/workspace-mcp/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create services/workspace-mcp/src/config.ts**

```ts
import path from "node:path";
import type { AuthConfig } from "@google-workspace/auth";

export const WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
];

export interface WorkspaceConfig extends AuthConfig {
  serviceName: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkspaceConfig {
  return {
    serviceName: "workspace-mcp",
    credentialsPath: path.resolve(env.WORKSPACE_CREDENTIALS_PATH ?? "credentials.json"),
    tokenPath: path.resolve(env.WORKSPACE_TOKEN_PATH ?? "workspace-token.json"),
    scopes: WORKSPACE_SCOPES,
  };
}
```

- [ ] **Step 4: Create services/workspace-mcp/src/index.ts (stdio entry)**

```ts
#!/usr/bin/env node
import { loadOrRefreshToken, startStdio } from "@google-workspace/auth";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const auth = await loadOrRefreshToken(config);
  const server = createServer(auth);
  await startStdio(server);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Create services/workspace-mcp/src/http.ts (HTTP entry)**

```ts
#!/usr/bin/env node
import { loadOrRefreshToken, startHttp } from "@google-workspace/auth";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const config = loadConfig();
  const auth = await loadOrRefreshToken(config);
  startHttp(() => createServer(auth), config.serviceName, port, host);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Create services/workspace-mcp/src/auth-cli.ts**

```ts
#!/usr/bin/env node
import { runAuthFlow } from "@google-workspace/auth";
import { loadConfig } from "./config.js";

const config = loadConfig();
runAuthFlow({
  credentialsPath: config.credentialsPath,
  tokenPath: config.tokenPath,
  scopes: config.scopes,
  serviceName: config.serviceName,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Create services/workspace-mcp/Dockerfile**

Build context is the monorepo root (set in compose.yaml via `build.context`).

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/workspace-mcp/package.json ./services/workspace-mcp/
RUN npm ci --workspace=workspace-mcp-server
COPY packages/google-auth/ ./packages/google-auth/
COPY services/workspace-mcp/tsconfig.json ./services/workspace-mcp/
COPY services/workspace-mcp/src ./services/workspace-mcp/src
RUN npm run build --workspace=workspace-mcp-server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/workspace-mcp/package.json ./services/workspace-mcp/
RUN npm ci --workspace=workspace-mcp-server --omit=dev && npm cache clean --force
COPY --from=build /app/services/workspace-mcp/dist ./services/workspace-mcp/dist
USER node
EXPOSE 3000
CMD ["node", "services/workspace-mcp/dist/http.js"]
```

- [ ] **Step 8: Create services/workspace-mcp/.dockerignore**

```
node_modules
dist
*.test.ts
```

- [ ] **Step 9: Create services/workspace-mcp/.env.example**

```
WORKSPACE_CREDENTIALS_PATH=/secrets/credentials.json
WORKSPACE_TOKEN_PATH=/secrets/workspace-token.json
HOST=0.0.0.0
PORT=3000
```

- [ ] **Step 10: Create placeholder server.ts (will be filled in Tasks 6-8)**

```ts
// services/workspace-mcp/src/server.ts
import type { Auth } from "googleapis";
import { createMcpServer } from "@google-workspace/auth";

export function createServer(_auth: Auth.OAuth2Client) {
  const server = createMcpServer("workspace-mcp", "0.1.0");
  return server;
}
```

- [ ] **Step 11: Install and verify build**

Run: `npm install && npm run build --workspace=workspace-mcp-server`
Expected: compiles without errors

- [ ] **Step 12: Commit**

```bash
git add services/workspace-mcp/
git commit -m "feat(workspace): scaffold workspace-mcp service with config and entry points"
```

---

### Task 6: workspace-mcp Sheets Service + Tools

**Files:**
- Create: `services/workspace-mcp/src/sheets-service.ts`
- Create: `services/workspace-mcp/src/sheets-service.test.ts`
- Modify: `services/workspace-mcp/src/server.ts`

**Interfaces:**
- Consumes: `Auth.OAuth2Client` from googleapis
- Produces: `SheetsService` class with methods: `listSpreadsheets`, `getSpreadsheet`, `readRange`, `writeRange`, `appendRows`, `createSpreadsheet`, `batchUpdate`

- [ ] **Step 1: Write the failing test**

```ts
// services/workspace-mcp/src/sheets-service.test.ts
import { describe, it, expect } from "vitest";
import { SheetsService } from "./sheets-service.js";

describe("SheetsService", () => {
  it("can be instantiated with an OAuth2 client", () => {
    const mockAuth = {} as never;
    const service = new SheetsService(mockAuth);
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=workspace-mcp-server`
Expected: FAIL — cannot find module `./sheets-service.js`

- [ ] **Step 3: Create services/workspace-mcp/src/sheets-service.ts**

```ts
import { google, type Auth } from "googleapis";

export class SheetsService {
  private sheets: ReturnType<typeof google.sheets>;
  private drive: ReturnType<typeof google.drive>;

  constructor(auth: Auth.OAuth2Client) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.drive = google.drive({ version: "v3", auth });
  }

  async listSpreadsheets(query?: string, maxResults = 20, pageToken?: string) {
    const q = query
      ? `mimeType='application/vnd.google-apps.spreadsheet' and (${query})`
      : "mimeType='application/vnd.google-apps.spreadsheet'";
    const response = await this.drive.files.list({
      q,
      pageSize: maxResults,
      pageToken,
      fields: "nextPageToken, files(id, name, createdTime, modifiedTime)",
    });
    return { files: response.data.files, nextPageToken: response.data.nextPageToken };
  }

  async getSpreadsheet(spreadsheetId: string) {
    const response = await this.sheets.spreadsheets.get({ spreadsheetId });
    return response.data;
  }

  async readRange(spreadsheetId: string, range: string) {
    const response = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
    return { range: response.data.range, values: response.data.values };
  }

  async writeRange(spreadsheetId: string, range: string, values: unknown[][], valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED") {
    const response = await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return response.data;
  }

  async appendRows(spreadsheetId: string, range: string, values: unknown[][], valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED") {
    const response = await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return response.data;
  }

  async createSpreadsheet(title: string, sheetTitles?: string[]) {
    const response = await this.sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: sheetTitles?.map((t) => ({ properties: { title: t } })),
      },
    });
    return { spreadsheetId: response.data.spreadsheetId, title: response.data.properties?.title, spreadsheetUrl: response.data.spreadsheetUrl };
  }

  async batchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]) {
    const response = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
    return response.data;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=workspace-mcp-server`
Expected: PASS

- [ ] **Step 5: Update server.ts to register Sheets tools**

```ts
// services/workspace-mcp/src/server.ts
import type { Auth } from "googleapis";
import { z } from "zod";
import { createMcpServer } from "@google-workspace/auth";
import { SheetsService } from "./sheets-service.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  const candidate = error as { message?: unknown; response?: { status?: unknown; data?: { error?: { message?: unknown } } } };
  const apiMessage = candidate.response?.data?.error?.message;
  const status = candidate.response?.status;
  const detail = typeof apiMessage === "string"
    ? apiMessage
    : error instanceof Error ? error.message : String(error);
  const message = typeof status === "number" ? `Google API error ${status}: ${detail}` : detail;
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function safe<TArgs extends Record<string, unknown>>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  };
}

export function createServer(auth: Auth.OAuth2Client) {
  const server = createMcpServer("workspace-mcp", "0.1.0");
  const sheets = new SheetsService(auth);

  server.registerTool("sheets_list", {
    title: "List spreadsheets",
    description: "Search for Google Spreadsheets in Drive.",
    inputSchema: {
      query: z.string().optional().describe("Additional Drive query filter"),
      maxResults: z.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe((args) => sheets.listSpreadsheets(args.query, args.maxResults, args.pageToken)));

  server.registerTool("sheets_get", {
    title: "Get spreadsheet metadata",
    description: "Get spreadsheet metadata including sheet names and properties.",
    inputSchema: { spreadsheetId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ spreadsheetId }) => sheets.getSpreadsheet(spreadsheetId)));

  server.registerTool("sheets_read_range", {
    title: "Read range",
    description: "Read cell values from a range using A1 notation (e.g. 'Sheet1!A1:D10').",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1).describe("A1 notation range, e.g. 'Sheet1!A1:D10'"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ spreadsheetId, range }) => sheets.readRange(spreadsheetId, range)));

  server.registerTool("sheets_write_range", {
    title: "Write range",
    description: "Write or update cell values in a range.",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1),
      values: z.array(z.array(z.unknown())).describe("2D array of cell values"),
      valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ spreadsheetId, range, values, valueInputOption }) => sheets.writeRange(spreadsheetId, range, values, valueInputOption)));

  server.registerTool("sheets_append_rows", {
    title: "Append rows",
    description: "Append rows after the last row with data in a sheet.",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1).describe("Sheet name or range to find the table, e.g. 'Sheet1'"),
      values: z.array(z.array(z.unknown())),
      valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ spreadsheetId, range, values, valueInputOption }) => sheets.appendRows(spreadsheetId, range, values, valueInputOption)));

  server.registerTool("sheets_create", {
    title: "Create spreadsheet",
    description: "Create a new Google Spreadsheet.",
    inputSchema: {
      title: z.string().min(1),
      sheetTitles: z.array(z.string()).optional().describe("Optional list of sheet tab names"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ title, sheetTitles }) => sheets.createSpreadsheet(title, sheetTitles)));

  server.registerTool("sheets_batch_update", {
    title: "Batch update spreadsheet",
    description: "Apply multiple operations (add/delete sheets, format cells, etc.) in one request.",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      requests: z.array(z.record(z.unknown())).describe("Array of Sheets API batch update request objects"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ spreadsheetId, requests }) => sheets.batchUpdate(spreadsheetId, requests)));

  return server;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test --workspace=workspace-mcp-server && npm run check --workspace=workspace-mcp-server`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add services/workspace-mcp/src/
git commit -m "feat(workspace): add Sheets service and tools"
```

---

### Task 7: workspace-mcp Docs Service + Tools

**Files:**
- Create: `services/workspace-mcp/src/docs-service.ts`
- Create: `services/workspace-mcp/src/docs-service.test.ts`
- Modify: `services/workspace-mcp/src/server.ts`

**Interfaces:**
- Consumes: `Auth.OAuth2Client`
- Produces: `DocsService` class with methods: `getDocument`, `createDocument`, `insertText`, `replaceText`, `batchUpdate`

- [ ] **Step 1: Write the failing test**

```ts
// services/workspace-mcp/src/docs-service.test.ts
import { describe, it, expect } from "vitest";
import { DocsService } from "./docs-service.js";

describe("DocsService", () => {
  it("can be instantiated with an OAuth2 client", () => {
    const mockAuth = {} as never;
    const service = new DocsService(mockAuth);
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=workspace-mcp-server`
Expected: FAIL — cannot find module `./docs-service.js`

- [ ] **Step 3: Create services/workspace-mcp/src/docs-service.ts**

```ts
import { google, type Auth } from "googleapis";

export class DocsService {
  private docs: ReturnType<typeof google.docs>;

  constructor(auth: Auth.OAuth2Client) {
    this.docs = google.docs({ version: "v1", auth });
  }

  async getDocument(documentId: string) {
    const response = await this.docs.documents.get({ documentId });
    return response.data;
  }

  async createDocument(title: string) {
    const response = await this.docs.documents.create({ requestBody: { title } });
    return { documentId: response.data.documentId, title: response.data.title };
  }

  async insertText(documentId: string, text: string, index = 1) {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { location: { index }, text } }],
      },
    });
    return response.data;
  }

  async replaceText(documentId: string, searchText: string, replaceText: string, matchCase = false) {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ replaceAllText: { containsText: { text: searchText, matchCase }, replaceText } }],
      },
    });
    return response.data;
  }

  async batchUpdate(documentId: string, requests: Record<string, unknown>[]) {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
    return response.data;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=workspace-mcp-server`
Expected: PASS

- [ ] **Step 5: Add Docs tools to server.ts (append after Sheets tools, before `return server`)**

```ts
import { DocsService } from "./docs-service.js";

// Inside createServer, after sheets tools:
const docs = new DocsService(auth);

server.registerTool("docs_get", {
  title: "Get document",
  description: "Read the full content and structure of a Google Doc.",
  inputSchema: { documentId: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, safe(({ documentId }) => docs.getDocument(documentId)));

server.registerTool("docs_create", {
  title: "Create document",
  description: "Create a new Google Doc.",
  inputSchema: { title: z.string().min(1) },
  annotations: { openWorldHint: true },
}, safe(({ title }) => docs.createDocument(title)));

server.registerTool("docs_insert_text", {
  title: "Insert text",
  description: "Insert text at a specific position in a Google Doc.",
  inputSchema: {
    documentId: z.string().min(1),
    text: z.string().min(1),
    index: z.number().int().min(1).default(1).describe("1-based character index to insert at"),
  },
  annotations: { openWorldHint: true },
}, safe(({ documentId, text, index }) => docs.insertText(documentId, text, index)));

server.registerTool("docs_replace_text", {
  title: "Replace text",
  description: "Find and replace all occurrences of text in a Google Doc.",
  inputSchema: {
    documentId: z.string().min(1),
    searchText: z.string().min(1),
    replaceText: z.string(),
    matchCase: z.boolean().default(false),
  },
  annotations: { openWorldHint: true },
}, safe(({ documentId, searchText, replaceText, matchCase }) => docs.replaceText(documentId, searchText, replaceText, matchCase)));

server.registerTool("docs_batch_update", {
  title: "Batch update document",
  description: "Apply multiple operations (insert, delete, format) to a Google Doc in one request.",
  inputSchema: {
    documentId: z.string().min(1),
    requests: z.array(z.record(z.unknown())).describe("Array of Docs API batch update request objects"),
  },
  annotations: { openWorldHint: true },
}, safe(({ documentId, requests }) => docs.batchUpdate(documentId, requests)));
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test --workspace=workspace-mcp-server && npm run check --workspace=workspace-mcp-server`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add services/workspace-mcp/src/
git commit -m "feat(workspace): add Docs service and tools"
```

---

### Task 8: workspace-mcp Drive Service + Tools

**Files:**
- Create: `services/workspace-mcp/src/drive-service.ts`
- Create: `services/workspace-mcp/src/drive-service.test.ts`
- Modify: `services/workspace-mcp/src/server.ts`

**Interfaces:**
- Consumes: `Auth.OAuth2Client`
- Produces: `DriveService` class with methods: `listFiles`, `searchFiles`, `getFileMetadata`, `downloadFile`, `uploadFile`, `createFolder`, `updateFile`, `deleteFile`

- [ ] **Step 1: Write the failing test**

```ts
// services/workspace-mcp/src/drive-service.test.ts
import { describe, it, expect } from "vitest";
import { DriveService } from "./drive-service.js";

describe("DriveService", () => {
  it("can be instantiated with an OAuth2 client", () => {
    const mockAuth = {} as never;
    const service = new DriveService(mockAuth);
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=workspace-mcp-server`
Expected: FAIL — cannot find module `./drive-service.js`

- [ ] **Step 3: Create services/workspace-mcp/src/drive-service.ts**

```ts
import { google, type Auth } from "googleapis";
import { Readable } from "node:stream";

const EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "application/pdf",
};

export class DriveService {
  private drive: ReturnType<typeof google.drive>;

  constructor(auth: Auth.OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
  }

  async listFiles(folderId?: string, maxResults = 20, pageToken?: string) {
    const q = folderId ? `'${folderId}' in parents and trashed=false` : "trashed=false";
    const response = await this.drive.files.list({
      q,
      pageSize: maxResults,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)",
    });
    return { files: response.data.files, nextPageToken: response.data.nextPageToken };
  }

  async searchFiles(query: string, maxResults = 20, pageToken?: string) {
    const response = await this.drive.files.list({
      q: `${query} and trashed=false`,
      pageSize: maxResults,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)",
    });
    return { files: response.data.files, nextPageToken: response.data.nextPageToken };
  }

  async getFileMetadata(fileId: string) {
    const response = await this.drive.files.get({
      fileId,
      fields: "id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink",
    });
    return response.data;
  }

  async downloadFile(fileId: string, maxBytes = 5_000_000) {
    const meta = await this.drive.files.get({ fileId, fields: "mimeType, name, size" });
    const mimeType = meta.data.mimeType ?? "";
    const fileName = meta.data.name ?? "file";

    if (mimeType.startsWith("application/vnd.google-apps.")) {
      const exportMimeType = EXPORT_MIME_TYPES[mimeType] ?? "application/pdf";
      const response = await this.drive.files.export({ fileId, mimeType: exportMimeType }, { responseType: "arraybuffer" });
      const buffer = Buffer.from(response.data as ArrayBuffer);
      if (buffer.length > maxBytes) throw new Error(`Exported file exceeds ${maxBytes} byte limit`);
      return { fileName, mimeType: exportMimeType, content: buffer.toString("base64"), encoding: "base64" as const };
    }

    const response = await this.drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data as ArrayBuffer);
    if (buffer.length > maxBytes) throw new Error(`File exceeds ${maxBytes} byte limit`);
    const isText = mimeType.startsWith("text/") || mimeType === "application/json";
    return isText
      ? { fileName, mimeType, content: buffer.toString("utf8"), encoding: "utf8" as const }
      : { fileName, mimeType, content: buffer.toString("base64"), encoding: "base64" as const };
  }

  async uploadFile(fileName: string, mimeType: string, content: string, encoding: "utf8" | "base64" = "utf8", parentId?: string) {
    const buffer = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    const media = { mimeType, body: Readable.from(buffer) };
    const requestBody: Record<string, unknown> = { name: fileName };
    if (parentId) requestBody.parents = [parentId];
    const response = await this.drive.files.create({ requestBody, media, fields: "id, name, mimeType, webViewLink" });
    return response.data;
  }

  async createFolder(name: string, parentId?: string) {
    const requestBody: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
    if (parentId) requestBody.parents = [parentId];
    const response = await this.drive.files.create({ requestBody, fields: "id, name, mimeType" });
    return response.data;
  }

  async updateFile(fileId: string, name?: string, addParents?: string, removeParents?: string) {
    const response = await this.drive.files.update({
      fileId,
      requestBody: name ? { name } : undefined,
      addParents,
      removeParents,
      fields: "id, name, parents",
    });
    return response.data;
  }

  async deleteFile(fileId: string) {
    const meta = await this.drive.files.get({ fileId, fields: "name" });
    await this.drive.files.delete({ fileId });
    return { deleted: meta.data.name, fileId };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=workspace-mcp-server`
Expected: PASS

- [ ] **Step 5: Add Drive tools to server.ts (append after Docs tools, before `return server`)**

```ts
import { DriveService } from "./drive-service.js";

// Inside createServer, after docs tools:
const drive = new DriveService(auth);

server.registerTool("drive_list_files", {
  title: "List files",
  description: "List files and folders in Google Drive. Optionally filter by parent folder.",
  inputSchema: {
    folderId: z.string().optional().describe("Parent folder ID to list contents of"),
    maxResults: z.number().int().min(1).max(100).default(20),
    pageToken: z.string().optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, safe(({ folderId, maxResults, pageToken }) => drive.listFiles(folderId, maxResults, pageToken)));

server.registerTool("drive_search", {
  title: "Search files",
  description: "Search files in Google Drive using Drive query syntax.",
  inputSchema: {
    query: z.string().min(1).describe("Drive query, e.g. \"name contains 'report'\""),
    maxResults: z.number().int().min(1).max(100).default(20),
    pageToken: z.string().optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, safe(({ query, maxResults, pageToken }) => drive.searchFiles(query, maxResults, pageToken)));

server.registerTool("drive_get_metadata", {
  title: "Get file metadata",
  description: "Get metadata for a file (name, type, size, links).",
  inputSchema: { fileId: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, safe(({ fileId }) => drive.getFileMetadata(fileId)));

server.registerTool("drive_download", {
  title: "Download file",
  description: "Download a file from Google Drive. Google Docs/Sheets are exported. Enforces a size limit.",
  inputSchema: {
    fileId: z.string().min(1),
    maxBytes: z.number().int().min(1).max(10_000_000).default(5_000_000),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, safe(({ fileId, maxBytes }) => drive.downloadFile(fileId, maxBytes)));

server.registerTool("drive_upload", {
  title: "Upload file",
  description: "Upload a file to Google Drive.",
  inputSchema: {
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    content: z.string().describe("File content (utf8 text or base64)"),
    encoding: z.enum(["utf8", "base64"]).default("utf8"),
    parentId: z.string().optional().describe("Parent folder ID"),
  },
  annotations: { openWorldHint: true },
}, safe(({ fileName, mimeType, content, encoding, parentId }) => drive.uploadFile(fileName, mimeType, content, encoding, parentId)));

server.registerTool("drive_create_folder", {
  title: "Create folder",
  description: "Create a new folder in Google Drive.",
  inputSchema: {
    name: z.string().min(1),
    parentId: z.string().optional(),
  },
  annotations: { openWorldHint: true },
}, safe(({ name, parentId }) => drive.createFolder(name, parentId)));

server.registerTool("drive_update_file", {
  title: "Update file",
  description: "Rename or move a file in Google Drive.",
  inputSchema: {
    fileId: z.string().min(1),
    name: z.string().optional().describe("New file name"),
    addParents: z.string().optional().describe("Folder ID to move file into"),
    removeParents: z.string().optional().describe("Folder ID to remove from"),
  },
  annotations: { openWorldHint: true },
}, safe(({ fileId, name, addParents, removeParents }) => drive.updateFile(fileId, name, addParents, removeParents)));

server.registerTool("drive_delete", {
  title: "Delete file",
  description: "Permanently delete a file from Google Drive. This cannot be undone.",
  inputSchema: { fileId: z.string().min(1) },
  annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
}, safe(({ fileId }) => drive.deleteFile(fileId)));
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test --workspace=workspace-mcp-server && npm run check --workspace=workspace-mcp-server`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add services/workspace-mcp/src/
git commit -m "feat(workspace): add Drive service and tools"
```

---

### Task 9: maps-mcp Scaffold + Config + Service

**Files:**
- Create: `services/maps-mcp/package.json`
- Create: `services/maps-mcp/tsconfig.json`
- Create: `services/maps-mcp/Dockerfile`
- Create: `services/maps-mcp/.dockerignore`
- Create: `services/maps-mcp/.env.example`
- Create: `services/maps-mcp/src/config.ts`
- Create: `services/maps-mcp/src/maps-service.ts`
- Create: `services/maps-mcp/src/maps-service.test.ts`

**Interfaces:**
- Produces: `MapsService` class with methods: `geocode`, `reverseGeocode`, `searchPlaces`, `nearbyPlaces`, `placeDetails`, `getDirections`

- [ ] **Step 1: Create services/maps-mcp/package.json**

```json
{
  "name": "maps-mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "start": "node dist/index.js",
    "start:http": "node dist/http.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@google-workspace/auth": "*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create services/maps-mcp/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create services/maps-mcp/src/config.ts**

```ts
import path from "node:path";

export interface MapsConfig {
  apiKey: string;
  credentialsPath?: string;
  tokenPath?: string;
  serviceName: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MapsConfig {
  const apiKey = env.MAPS_API_KEY;
  if (!apiKey) throw new Error("MAPS_API_KEY environment variable is required");
  return {
    apiKey,
    credentialsPath: env.MAPS_CREDENTIALS_PATH ? path.resolve(env.MAPS_CREDENTIALS_PATH) : undefined,
    tokenPath: env.MAPS_TOKEN_PATH ? path.resolve(env.MAPS_TOKEN_PATH) : undefined,
    serviceName: "maps-mcp",
  };
}
```

- [ ] **Step 4: Write the failing test**

```ts
// services/maps-mcp/src/maps-service.test.ts
import { describe, it, expect } from "vitest";
import { MapsService } from "./maps-service.js";

describe("MapsService", () => {
  it("can be instantiated with an API key", () => {
    const service = new MapsService("test-key");
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm run test --workspace=maps-mcp-server`
Expected: FAIL — cannot find module `./maps-service.js`

- [ ] **Step 6: Create services/maps-mcp/src/maps-service.ts**

```ts
const BASE_URL = "https://maps.googleapis.com";
const PLACES_BASE_URL = "https://places.googleapis.com";

export class MapsService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Maps API error ${response.status}: ${body}`);
    }
    return response.json() as Promise<T>;
  }

  async geocode(address: string, language?: string, region?: string) {
    const params = new URLSearchParams({ address, key: this.apiKey });
    if (language) params.set("language", language);
    if (region) params.set("region", region);
    const data = await this.fetchJson<{ status: string; results: unknown[] }>(`${BASE_URL}/maps/api/geocode/json?${params}`);
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Geocoding failed: ${data.status}`);
    return data.results;
  }

  async reverseGeocode(lat: number, lng: number, language?: string) {
    const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: this.apiKey });
    if (language) params.set("language", language);
    const data = await this.fetchJson<{ status: string; results: unknown[] }>(`${BASE_URL}/maps/api/geocode/json?${params}`);
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Reverse geocoding failed: ${data.status}`);
    return data.results;
  }

  async searchPlaces(query: string, language?: string, region?: string) {
    const body: Record<string, unknown> = { textQuery: query };
    if (language) body.languageCode = language;
    if (region) body.regionCode = region;
    const data = await this.fetchJson<{ places: unknown[] }>(`${PLACES_BASE_URL}/v1/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.googleMapsUri,places.primaryType" },
      body: JSON.stringify(body),
    });
    return data.places;
  }

  async nearbyPlaces(lat: number, lng: number, radiusMeters = 1000, types?: string[], language?: string) {
    const body: Record<string, unknown> = {
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
    };
    if (types?.length) body.includedTypes = types;
    if (language) body.languageCode = language;
    const data = await this.fetchJson<{ places: unknown[] }>(`${PLACES_BASE_URL}/v1/places:searchNearby`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryType" },
      body: JSON.stringify(body),
    });
    return data.places;
  }

  async placeDetails(placeId: string, language?: string) {
    const params = new URLSearchParams({ key: this.apiKey, place_id: placeId });
    if (language) params.set("language", language);
    const data = await this.fetchJson<{ status: string; result: unknown }>(`${BASE_URL}/maps/api/place/details/json?${params}`);
    if (data.status !== "OK") throw new Error(`Place details failed: ${data.status}`);
    return data.result;
  }

  async getDirections(origin: string, destination: string, mode: "driving" | "walking" | "bicycling" | "transit" = "driving", language?: string) {
    const params = new URLSearchParams({ origin, destination, mode, key: this.apiKey });
    if (language) params.set("language", language);
    const data = await this.fetchJson<{ status: string; routes: unknown[] }>(`${BASE_URL}/maps/api/directions/json?${params}`);
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Directions failed: ${data.status}`);
    return data.routes;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test --workspace=maps-mcp-server`
Expected: PASS

- [ ] **Step 8: Create services/maps-mcp/.env.example**

```
MAPS_API_KEY=your-api-key-here
MAPS_CREDENTIALS_PATH=/secrets/credentials.json
MAPS_TOKEN_PATH=/secrets/maps-token.json
HOST=0.0.0.0
PORT=3000
```

- [ ] **Step 9: Create services/maps-mcp/.dockerignore**

```
node_modules
dist
*.test.ts
```

- [ ] **Step 10: Create services/maps-mcp/Dockerfile**

Build context is the monorepo root (set in compose.yaml via `build.context`).

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/maps-mcp/package.json ./services/maps-mcp/
RUN npm ci --workspace=maps-mcp-server
COPY packages/google-auth/ ./packages/google-auth/
COPY services/maps-mcp/tsconfig.json ./services/maps-mcp/
COPY services/maps-mcp/src ./services/maps-mcp/src
RUN npm run build --workspace=maps-mcp-server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/google-auth/package.json ./packages/google-auth/
COPY services/maps-mcp/package.json ./services/maps-mcp/
RUN npm ci --workspace=maps-mcp-server --omit=dev && npm cache clean --force
COPY --from=build /app/services/maps-mcp/dist ./services/maps-mcp/dist
USER node
EXPOSE 3000
CMD ["node", "services/maps-mcp/dist/http.js"]
```

- [ ] **Step 11: Commit**

```bash
git add services/maps-mcp/
git commit -m "feat(maps): scaffold maps-mcp service with MapsService"
```

---

### Task 10: maps-mcp Server + Entry Points

**Files:**
- Create: `services/maps-mcp/src/server.ts`
- Create: `services/maps-mcp/src/server.test.ts`
- Create: `services/maps-mcp/src/index.ts`
- Create: `services/maps-mcp/src/http.ts`

**Interfaces:**
- Consumes: `MapsService`, `createMcpServer`, `startHttp`, `startStdio`
- Produces: complete maps-mcp service with 6 tools

- [ ] **Step 1: Write the failing test**

```ts
// services/maps-mcp/src/server.test.ts
import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { MapsService } from "./maps-service.js";

describe("maps createServer", () => {
  it("creates a server with tools registered", () => {
    const maps = new MapsService("test-key");
    const server = createServer(maps);
    expect(server).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=maps-mcp-server`
Expected: FAIL — cannot find module `./server.js`

- [ ] **Step 3: Create services/maps-mcp/src/server.ts**

```ts
import { z } from "zod";
import { createMcpServer } from "@google-workspace/auth";
import type { MapsService } from "./maps-service.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: detail }] };
}

function safe<TArgs extends Record<string, unknown>>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  };
}

export function createServer(maps: MapsService) {
  const server = createMcpServer("maps-mcp", "0.1.0");

  server.registerTool("maps_geocode", {
    title: "Geocode address",
    description: "Convert an address to geographic coordinates (lat/lng).",
    inputSchema: {
      address: z.string().min(1).describe("Address to geocode"),
      language: z.string().optional(),
      region: z.string().optional().describe("Region bias, e.g. 'th'"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ address, language, region }) => maps.geocode(address, language, region)));

  server.registerTool("maps_reverse_geocode", {
    title: "Reverse geocode",
    description: "Convert coordinates (lat/lng) to a human-readable address.",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ lat, lng, language }) => maps.reverseGeocode(lat, lng, language)));

  server.registerTool("maps_search_places", {
    title: "Search places",
    description: "Search for places using a text query (e.g. 'coffee shops in Bangkok').",
    inputSchema: {
      query: z.string().min(1),
      language: z.string().optional(),
      region: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ query, language, region }) => maps.searchPlaces(query, language, region)));

  server.registerTool("maps_nearby_places", {
    title: "Nearby places",
    description: "Search for places near a location within a radius.",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusMeters: z.number().int().min(1).max(50000).default(1000),
      types: z.array(z.string()).optional().describe("Place types to filter, e.g. ['restaurant', 'cafe']"),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ lat, lng, radiusMeters, types, language }) => maps.nearbyPlaces(lat, lng, radiusMeters, types, language)));

  server.registerTool("maps_place_details", {
    title: "Place details",
    description: "Get detailed information about a place (rating, hours, reviews, phone).",
    inputSchema: {
      placeId: z.string().min(1),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ placeId, language }) => maps.placeDetails(placeId, language)));

  server.registerTool("maps_directions", {
    title: "Get directions",
    description: "Get directions between two locations (driving, walking, bicycling, transit).",
    inputSchema: {
      origin: z.string().min(1).describe("Origin address or 'lat,lng'"),
      destination: z.string().min(1).describe("Destination address or 'lat,lng'"),
      mode: z.enum(["driving", "walking", "bicycling", "transit"]).default("driving"),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ origin, destination, mode, language }) => maps.getDirections(origin, destination, mode, language)));

  return server;
}
```

- [ ] **Step 4: Create services/maps-mcp/src/index.ts (stdio entry)**

```ts
#!/usr/bin/env node
import { startStdio } from "@google-workspace/auth";
import { loadConfig } from "./config.js";
import { MapsService } from "./maps-service.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const maps = new MapsService(config.apiKey);
  const server = createServer(maps);
  await startStdio(server);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Create services/maps-mcp/src/http.ts (HTTP entry)**

```ts
#!/usr/bin/env node
import { startHttp } from "@google-workspace/auth";
import { loadConfig } from "./config.js";
import { MapsService } from "./maps-service.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const config = loadConfig();
  const maps = new MapsService(config.apiKey);
  startHttp(() => createServer(maps), config.serviceName, port, host);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test --workspace=maps-mcp-server && npm run check --workspace=maps-mcp-server`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add services/maps-mcp/src/
git commit -m "feat(maps): add server with geocode, places, and directions tools"
```

---

### Task 11: Docker Compose Integration

**Files:**
- Modify: `compose.yaml`

**Interfaces:**
- Consumes: workspace-mcp and maps-mcp services built in Tasks 5-10
- Produces: full compose stack with all 4 services + auth profiles

- [ ] **Step 1: Update compose.yaml to add workspace-mcp, maps-mcp, and auth profiles**

Add after the existing gmail services in `compose.yaml`:

```yaml
  workspace-mcp:
    <<: *runtime
    build:
      context: .
      dockerfile: services/workspace-mcp/Dockerfile
    environment:
      HOST: 0.0.0.0
      PORT: 3000
      WORKSPACE_CREDENTIALS_PATH: /secrets/credentials.json
      WORKSPACE_TOKEN_PATH: /secrets/workspace-token.json
    ports:
      - "127.0.0.1:3003:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  workspace-auth:
    profiles: ["auth-workspace"]
    build:
      context: .
      dockerfile: services/workspace-mcp/Dockerfile
    init: true
    command: ["node", "services/workspace-mcp/dist/auth-cli.js"]
    environment:
      WORKSPACE_CREDENTIALS_PATH: /secrets/credentials.json
      WORKSPACE_TOKEN_PATH: /secrets/workspace-token.json
      OAUTH_CALLBACK_BIND: 0.0.0.0
      OAUTH_CALLBACK_PORT: 3103
      OAUTH_REDIRECT_HOST: localhost
    ports:
      - "127.0.0.1:3103:3103"
    volumes:
      - ./secrets:/secrets

  maps-mcp:
    <<: *runtime
    build:
      context: .
      dockerfile: services/maps-mcp/Dockerfile
    environment:
      HOST: 0.0.0.0
      PORT: 3000
      MAPS_API_KEY: ${MAPS_API_KEY}
      MAPS_CREDENTIALS_PATH: /secrets/credentials.json
      MAPS_TOKEN_PATH: /secrets/maps-token.json
    ports:
      - "127.0.0.1:3004:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

- [ ] **Step 2: Create .env.example at root**

```
MAPS_API_KEY=your-google-maps-api-key
```

- [ ] **Step 3: Verify compose config**

Run: `docker compose config --quiet`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add compose.yaml .env.example
git commit -m "feat: add workspace-mcp and maps-mcp to Docker Compose"
```

---

### Task 12: Final Verification + README Update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all services built
- Produces: updated documentation, verified full build

- [ ] **Step 1: Run full workspace build**

Run: `npm run build`
Expected: all workspaces build without errors

- [ ] **Step 2: Run full workspace check**

Run: `npm run check`
Expected: all workspaces typecheck without errors

- [ ] **Step 3: Run full workspace tests**

Run: `npm run test`
Expected: all tests pass

- [ ] **Step 4: Update README.md to document new services**

Add to the structure section and endpoints:

```markdown
## Endpoints

- Gmail MCP: `http://127.0.0.1:3001/mcp`
- Calendar MCP: `http://127.0.0.1:3002/mcp`
- Workspace MCP (Sheets/Docs/Drive): `http://127.0.0.1:3003/mcp`
- Maps MCP: `http://127.0.0.1:3004/mcp`

## ขอ OAuth tokens

```sh
# Workspace (Sheets + Docs + Drive)
docker compose --profile auth-workspace run --rm --service-ports workspace-auth

# Maps (optional, ต้องมี MAPS_API_KEY ใน .env)
docker compose up maps-mcp
```
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with workspace-mcp and maps-mcp"
```
