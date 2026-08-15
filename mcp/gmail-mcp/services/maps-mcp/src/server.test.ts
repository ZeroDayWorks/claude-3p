import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { MapsService } from "./maps-service.js";

describe("maps createServer", () => {
  it("creates a server with tools registered", () => {
    const maps = new MapsService("test-key");
    const server = createServer(maps);
    expect(server).toBeDefined();
  });
});
