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
