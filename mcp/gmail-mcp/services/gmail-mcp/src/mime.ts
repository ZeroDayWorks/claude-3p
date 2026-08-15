import type { gmail_v1 } from "googleapis";

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate?: string;
  headers: Record<string, string>;
  text?: string;
  html?: string;
  attachments: Array<{ filename: string; mimeType: string; attachmentId?: string; size?: number }>;
}

export function decodeBase64Url(data?: string | null): string | undefined {
  if (!data) return undefined;
  return Buffer.from(data, "base64url").toString("utf8");
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  result: Pick<ParsedMessage, "text" | "html" | "attachments">,
): void {
  if (!part) return;
  const decoded = decodeBase64Url(part.body?.data);
  if (part.mimeType === "text/plain" && decoded && !result.text) result.text = decoded;
  if (part.mimeType === "text/html" && decoded && !result.html) result.html = decoded;
  if (part.filename) {
    result.attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      ...(part.body?.attachmentId ? { attachmentId: part.body.attachmentId } : {}),
      ...(part.body?.size != null ? { size: part.body.size } : {}),
    });
  }
  for (const child of part.parts ?? []) walkParts(child, result);
}

export function parseMessage(message: gmail_v1.Schema$Message): ParsedMessage {
  if (!message.id || !message.threadId) throw new Error("Gmail returned a message without an id or threadId");
  const headers = Object.fromEntries(
    (message.payload?.headers ?? [])
      .filter((header): header is { name: string; value: string } => Boolean(header.name && header.value != null))
      .map((header) => [header.name.toLowerCase(), header.value]),
  );
  const body: Pick<ParsedMessage, "text" | "html" | "attachments"> = { attachments: [] };
  walkParts(message.payload, body);
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds ?? [],
    snippet: message.snippet ?? "",
    ...(message.internalDate ? { internalDate: message.internalDate } : {}),
    headers,
    ...body,
  };
}

function assertSafeHeader(value: string, name: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${name} must not contain newline characters`);
  return value;
}

function encodeHeader(value: string): string {
  assertSafeHeader(value, "Subject");
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

export interface ComposeInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  contentType?: "text/plain" | "text/html";
  inReplyTo?: string;
  references?: string;
}

export function composeRawMessage(input: ComposeInput): string {
  const to = input.to.map((value) => assertSafeHeader(value, "To"));
  const cc = input.cc?.map((value) => assertSafeHeader(value, "Cc"));
  const bcc = input.bcc?.map((value) => assertSafeHeader(value, "Bcc"));
  const inReplyTo = input.inReplyTo ? assertSafeHeader(input.inReplyTo, "In-Reply-To") : undefined;
  const references = input.references ? assertSafeHeader(input.references, "References") : undefined;
  const lines = [
    `To: ${to.join(", ")}`,
    ...(cc?.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc?.length ? [`Bcc: ${bcc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: ${input.contentType ?? "text/plain"}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
    "",
    Buffer.from(input.body).toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
