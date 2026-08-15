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
