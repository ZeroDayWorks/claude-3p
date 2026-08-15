#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAuthorizedClient } from "./auth.js";
import { CalendarService } from "./calendar-service.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const auth = await createAuthorizedClient(loadConfig());
  await createServer(CalendarService.fromAuth(auth)).connect(new StdioServerTransport());
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
