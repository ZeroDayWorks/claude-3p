import { watchFile } from "node:fs";
import { readFile as readFileAsync, writeFile as writeFileAsync } from "node:fs/promises";
import { google, type Auth } from "googleapis";
import type { Config } from "./config.js";

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
    return JSON.parse(await readFileAsync(filePath, "utf8")) as T;
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

export async function createAuthorizedClient(config: Config): Promise<Auth.OAuth2Client> {
  const clientConfig = await loadClientSecrets(config.credentialsPath);
  const oauth = createOAuth2Client(clientConfig);
  const token = await loadToken(config.tokenPath);
  oauth.setCredentials(token);

  // google-auth-library refreshes the access token automatically when needed.
  // Persist refreshed credentials so the token file stays current across
  // restarts. Keep the existing refresh token when Google only returns a new
  // access token and expiry date.
  oauth.on("tokens", (newTokens) => {
    const merged = { ...oauth.credentials, ...newTokens };
    void saveToken(config.tokenPath, merged).catch((error) => {
      console.error(`Unable to persist refreshed Gmail token: ${error instanceof Error ? error.message : error}`);
    });
  });

  watchTokenFile(config.tokenPath, oauth);

  return oauth;
}

function watchTokenFile(tokenPath: string, oauth: Auth.OAuth2Client): void {
  let reloadTimer: NodeJS.Timeout | undefined;

  watchFile(tokenPath, { persistent: false, interval: 500 }, () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try {
        const token = await loadToken(tokenPath);
        const current = oauth.credentials;
        const changed = token.access_token !== current.access_token
          || token.refresh_token !== current.refresh_token
          || token.expiry_date !== current.expiry_date
          || token.scope !== current.scope;
        if (changed) {
          oauth.setCredentials(token);
          console.error("Reloaded Gmail OAuth token from disk; no service restart required.");
        }
      } catch (error) {
        console.error(`Unable to reload Gmail OAuth token: ${error instanceof Error ? error.message : error}`);
      }
    }, 200);
  });
}

export async function loadToken(tokenPath: string): Promise<Auth.Credentials> {
  return readJson<Auth.Credentials>(tokenPath);
}

export async function saveToken(tokenPath: string, credentials: Auth.Credentials): Promise<void> {
  await writeFileAsync(tokenPath, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
