import path from "node:path";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export interface Config {
  credentialsPath: string;
  tokenPath: string;
  scopes: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    credentialsPath: path.resolve(env.CALENDAR_CREDENTIALS_PATH ?? "credentials.json"),
    tokenPath: path.resolve(env.CALENDAR_TOKEN_PATH ?? "token.json"),
    scopes: (env.CALENDAR_SCOPES ?? DEFAULT_SCOPES.join(" "))
      .split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
  };
}
