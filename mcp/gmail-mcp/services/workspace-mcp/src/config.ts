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
