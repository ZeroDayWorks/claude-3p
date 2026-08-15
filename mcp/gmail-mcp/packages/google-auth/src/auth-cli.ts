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
