import { describe, it, expect } from "vitest";
import { SheetsService } from "./sheets-service.js";

describe("SheetsService", () => {
  it("can be instantiated with an OAuth2 client", () => {
    const mockAuth = {} as never;
    const service = new SheetsService(mockAuth);
    expect(service).toBeDefined();
  });
});
