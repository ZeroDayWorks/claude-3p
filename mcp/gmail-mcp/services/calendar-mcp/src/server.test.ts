import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { CalendarService } from "./calendar-service.js";
import { createServer } from "./server.js";

describe("Calendar MCP server", () => {
  it("advertises the intended tools", async () => {
    const server = createServer({} as CalendarService);
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "calendar_list_calendars", "calendar_list_events", "calendar_get_event",
        "calendar_query_freebusy", "calendar_create_event", "calendar_update_event", "calendar_delete_event",
      ]);
    } finally {
      await client.close(); await server.close();
    }
  });
});
