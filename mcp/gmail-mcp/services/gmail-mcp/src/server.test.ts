import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { GmailService } from "./gmail-service.js";
import { createServer } from "./server.js";

describe("MCP server", () => {
  it("advertises Gmail tools and routes a search call", async () => {
    const search = vi.fn().mockResolvedValue({ messages: [], resultSizeEstimate: 0 });
    const gmail = { search } as unknown as GmailService;
    const server = createServer(gmail);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "gmail_search",
        "gmail_get_message",
        "gmail_get_thread",
        "gmail_get_attachment",
        "gmail_list_labels",
        "gmail_modify_thread_labels",
        "gmail_create_draft",
        "gmail_create_reply_draft",
        "gmail_send_draft",
        "gmail_trash_thread",
      ]);

      const response = await client.callTool({
        name: "gmail_search",
        arguments: { query: "is:unread", maxResults: 5 },
      });
      expect(response.isError).not.toBe(true);
      expect(search).toHaveBeenCalledWith({
        query: "is:unread",
        maxResults: 5,
        includeSpamTrash: false,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
