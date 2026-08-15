#!/usr/bin/env node
import { startStdio } from "@google-workspace/auth";
import { loadConfig } from "./config.js";
import { MapsService } from "./maps-service.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const maps = new MapsService(config.apiKey);
  const server = createServer(maps);
  await startStdio(server);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
