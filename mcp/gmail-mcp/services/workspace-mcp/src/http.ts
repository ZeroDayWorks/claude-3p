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
