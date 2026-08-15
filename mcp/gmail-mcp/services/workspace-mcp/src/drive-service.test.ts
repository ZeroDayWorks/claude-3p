import { describe, it, expect } from "vitest";
import { DriveService } from "./drive-service.js";

describe("DriveService", () => {
  it("can be instantiated with an OAuth2 client", () => {
    const mockAuth = {} as never;
    const service = new DriveService(mockAuth);
    expect(service).toBeDefined();
  });
});
