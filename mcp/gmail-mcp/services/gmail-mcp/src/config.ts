import path from "node:path";

export const DEFAULT_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export interface Config {
  credentialsPath: string;
  tokenPath: string;
  scopes: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    credentialsPath: path.resolve(env.GMAIL_CREDENTIALS_PATH ?? "credentials.json"),
    tokenPath: path.resolve(env.GMAIL_TOKEN_PATH ?? "token.json"),
    scopes: (env.GMAIL_SCOPES ?? DEFAULT_SCOPE)
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}
