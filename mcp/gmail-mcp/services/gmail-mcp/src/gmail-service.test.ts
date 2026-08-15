import { describe, expect, it, vi } from "vitest";
import type { gmail_v1 } from "googleapis";
import { GmailService } from "./gmail-service.js";
import { decodeBase64Url } from "./mime.js";

describe("GmailService", () => {
  it("creates a threaded reply draft from the original headers", async () => {
    const get = vi.fn().mockResolvedValue({ data: {
      id: "original", threadId: "thread-1", snippet: "hello",
      payload: { headers: [
        { name: "Reply-To", value: "Alice <alice@example.com>" },
        { name: "Subject", value: "Project" },
        { name: "Message-ID", value: "<message-1@example.com>" },
        { name: "References", value: "<message-0@example.com>" },
      ] },
    } });
    const create = vi.fn().mockResolvedValue({ data: {
      id: "draft-1", message: { id: "draft-message", threadId: "thread-1" },
    } });
    const api = { users: { messages: { get }, drafts: { create } } } as unknown as gmail_v1.Gmail;
    const service = new GmailService(api);

    const draft = await service.createReplyDraft({ messageId: "original", body: "Thanks" });

    expect(draft.replyingTo).toBe("Alice <alice@example.com>");
    const request = create.mock.calls[0]![0];
    expect(request.requestBody.message.threadId).toBe("thread-1");
    const raw = decodeBase64Url(request.requestBody.message.raw)!;
    expect(raw).toContain("To: Alice <alice@example.com>");
    expect(raw).toContain("Subject: Re: Project");
    expect(raw).toContain("In-Reply-To: <message-1@example.com>");
    expect(raw).toContain("References: <message-0@example.com> <message-1@example.com>");
  });

  it("enforces the attachment response limit", async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: Buffer.from("12345").toString("base64url") } });
    const api = { users: { messages: { attachments: { get } } } } as unknown as gmail_v1.Gmail;
    const service = new GmailService(api);
    await expect(service.getAttachment("m1", "a1", 4)).rejects.toThrow("exceeding the 4-byte response limit");
  });
});
