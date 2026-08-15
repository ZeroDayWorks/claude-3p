import { describe, expect, it } from "vitest";
import { composeRawMessage, decodeBase64Url, parseMessage } from "./mime.js";

describe("MIME helpers", () => {
  it("decodes nested message bodies and reports attachments", () => {
    const parsed = parseMessage({
      id: "m1", threadId: "t1", snippet: "hello", labelIds: ["INBOX"],
      payload: { mimeType: "multipart/mixed", headers: [{ name: "Subject", value: "Test" }], parts: [
        { mimeType: "multipart/alternative", parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("plain").toString("base64url") } },
          { mimeType: "text/html", body: { data: Buffer.from("<b>html</b>").toString("base64url") } },
        ] },
        { filename: "a.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 42 } },
      ] },
    });
    expect(parsed.text).toBe("plain");
    expect(parsed.html).toBe("<b>html</b>");
    expect(parsed.headers.subject).toBe("Test");
    expect(parsed.attachments).toEqual([{ filename: "a.pdf", mimeType: "application/pdf", attachmentId: "a1", size: 42 }]);
  });

  it("creates an RFC-like base64url raw message", () => {
    const raw = composeRawMessage({ to: ["a@example.com"], subject: "Hello", body: "World" });
    const decoded = decodeBase64Url(raw)!;
    expect(decoded).toContain("To: a@example.com\r\n");
    expect(decoded).toContain("Subject: Hello\r\n");
    expect(decoded).toContain(Buffer.from("World").toString("base64"));
  });

  it("rejects header newline injection", () => {
    expect(() => composeRawMessage({
      to: ["a@example.com"],
      subject: "Hello\r\nBcc: attacker@example.com",
      body: "World",
    })).toThrow("Subject must not contain newline characters");
  });
});
