import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export function createMcpServer(name: string, version: string): McpServer {
  return new McpServer({ name, version });
}

export async function startStdio(server: McpServer): Promise<void> {
  await server.connect(new StdioServerTransport());
}

export function startHttp(
  createServerFn: () => McpServer,
  serviceName: string,
  port: number,
  host: string = "0.0.0.0",
): void {
  const app = createMcpExpressApp({ host });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: serviceName });
  });

  app.post("/mcp", async (request, response) => {
    const server = createServerFn();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });

  app.all("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  });

  const httpServer = app.listen(port, host, () => {
    console.error(`${serviceName} listening on http://${host}:${port}/mcp`);
  });
  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
