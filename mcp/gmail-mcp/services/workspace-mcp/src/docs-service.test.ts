import { describe, it, expect } from "vitest";
import { DocsService } from "./docs-service.js";

describe("DocsService", () => {
  it("can be instantiated with an OAuth2 client", () => {
    const mockAuth = {} as never;
    const service = new DocsService(mockAuth);
    expect(service).toBeDefined();
  });
});
