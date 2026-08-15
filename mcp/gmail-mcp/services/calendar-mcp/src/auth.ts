import { readFile, writeFile } from "node:fs/promises";
import { google, type Auth } from "googleapis";
import type { Config } from "./config.js";

interface OAuthClientConfig { client_id: string; client_secret: string; }
interface ClientSecrets { installed?: OAuthClientConfig; web?: OAuthClientConfig; }

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

export async function createAuthorizedClient(config: Config): Promise<Auth.OAuth2Client> {
  const client = await loadClientSecrets(config.credentialsPath);
  const oauth = new google.auth.OAuth2(client.client_id, client.client_secret);
  oauth.setCredentials(await readJson<Auth.Credentials>(config.tokenPath));
  return oauth;
}

export async function saveToken(tokenPath: string, credentials: Auth.Credentials): Promise<void> {
  await writeFile(tokenPath, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
