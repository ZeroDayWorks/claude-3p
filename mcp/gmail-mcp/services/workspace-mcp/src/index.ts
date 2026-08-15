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
