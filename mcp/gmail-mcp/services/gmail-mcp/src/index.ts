#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAuthorizedClient } from "./auth.js";
import { loadConfig } from "./config.js";
import { GmailService } from "./gmail-service.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const auth = await createAuthorizedClient(loadConfig());
  const server = createServer(GmailService.fromAuth(auth));
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  // stdout is reserved for MCP JSON-RPC when using stdio.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
