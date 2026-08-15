import { describe, it, expect } from "vitest";
import { MapsService } from "./maps-service.js";

describe("MapsService", () => {
  it("can be instantiated with an API key", () => {
    const service = new MapsService("test-key");
    expect(service).toBeDefined();
  });
});
