#!/usr/bin/env node
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAuthorizedClient } from "./auth.js";
import { CalendarService } from "./calendar-service.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const auth = await createAuthorizedClient(loadConfig());
  const calendar = CalendarService.fromAuth(auth);
  const app = createMcpExpressApp({ host });
  app.get("/health", (_request, response) => response.json({ status: "ok", service: "calendar-mcp" }));
  app.post("/mcp", async (request, response) => {
    const server = createServer(calendar);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!response.headersSent) response.status(500).json({
        jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null,
      });
    } finally {
      await transport.close();
      await server.close();
    }
  });
  app.all("/mcp", (_request, response) => response.status(405).json({
    jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null,
  }));
  const httpServer = app.listen(port, host, () => console.error(`Calendar MCP listening on http://${host}:${port}/mcp`));
  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
