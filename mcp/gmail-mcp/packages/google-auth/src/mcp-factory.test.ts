import { describe, it, expect } from "vitest";
import { createMcpServer } from "./mcp-factory.js";

describe("createMcpServer", () => {
  it("creates an McpServer with given name and version", () => {
    const server = createMcpServer("test-server", "1.0.0");
    expect(server).toBeDefined();
  });
});
