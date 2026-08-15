import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GmailService } from "./gmail-service.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  const candidate = error as { message?: unknown; response?: { status?: unknown; data?: { error?: { message?: unknown } } } };
  const apiMessage = candidate.response?.data?.error?.message;
  const status = candidate.response?.status;
  const detail = typeof apiMessage === "string"
    ? apiMessage
    : error instanceof Error ? error.message : String(error);
  const message = typeof status === "number" ? `Gmail API error ${status}: ${detail}` : detail;
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function safe<TArgs extends Record<string, unknown>>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  };
}

export function createServer(gmail: GmailService): McpServer {
  const server = new McpServer({ name: "gmail-mcp", version: "0.2.0" });

  server.registerTool("gmail_search", {
    title: "Search Gmail",
    description: "Search Gmail using Gmail query syntax. Returns message metadata and snippets, not full bodies.",
    inputSchema: {
      query: z.string().optional().describe("Gmail search expression, e.g. 'from:alice@example.com is:unread'"),
      labelIds: z.array(z.string()).optional(),
      maxResults: z.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
      includeSpamTrash: z.boolean().default(false),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe((args) => gmail.search(args)));

  server.registerTool("gmail_get_message", {
    title: "Get Gmail message",
    description: "Get one Gmail message, including decoded text/HTML bodies and attachment metadata.",
    inputSchema: { messageId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ messageId }) => gmail.getMessage(messageId)));

  server.registerTool("gmail_get_thread", {
    title: "Get Gmail thread",
    description: "Get every message in a Gmail conversation thread.",
    inputSchema: { threadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ threadId }) => gmail.getThread(threadId)));

  server.registerTool("gmail_get_attachment", {
    title: "Get Gmail attachment",
    description: "Fetch a small attachment by message and attachment ID. Returns standard base64 data and enforces a size limit to protect model context.",
    inputSchema: {
      messageId: z.string().min(1),
      attachmentId: z.string().min(1),
      maxBytes: z.number().int().min(1).max(5_000_000).default(1_000_000),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ messageId, attachmentId, maxBytes }) => gmail.getAttachment(messageId, attachmentId, maxBytes)));

  server.registerTool("gmail_list_labels", {
    title: "List Gmail labels",
    description: "List system and user labels and their identifiers.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(() => gmail.listLabels()));

  server.registerTool("gmail_modify_thread_labels", {
    title: "Modify Gmail thread labels",
    description: "Add or remove labels on every message in a thread. Use label IDs from gmail_list_labels.",
    inputSchema: {
      threadId: z.string().min(1),
      addLabelIds: z.array(z.string()).default([]),
      removeLabelIds: z.array(z.string()).default([]),
    },
    annotations: { idempotentHint: true, openWorldHint: true },
  }, safe(({ threadId, addLabelIds, removeLabelIds }) => gmail.modifyThreadLabels(threadId, addLabelIds, removeLabelIds)));

  server.registerTool("gmail_create_draft", {
    title: "Create Gmail draft",
    description: "Create, but do not send, a Gmail draft. For replies, provide threadId, inReplyTo, and references.",
    inputSchema: {
      to: z.array(z.string().email()).min(1),
      cc: z.array(z.string().email()).optional(),
      bcc: z.array(z.string().email()).optional(),
      subject: z.string(),
      body: z.string(),
      contentType: z.enum(["text/plain", "text/html"]).default("text/plain"),
      threadId: z.string().optional(),
      inReplyTo: z.string().optional().describe("RFC Message-ID header of the message being replied to"),
      references: z.string().optional().describe("RFC References header value"),
    },
    annotations: { idempotentHint: false, openWorldHint: true },
  }, safe((args) => gmail.createDraft(args)));

  server.registerTool("gmail_create_reply_draft", {
    title: "Create Gmail reply draft",
    description: "Create, but do not send, a correctly threaded reply draft. Recipient, subject, thread, Message-ID, and References are derived from the original message.",
    inputSchema: {
      messageId: z.string().min(1),
      body: z.string(),
      contentType: z.enum(["text/plain", "text/html"]).default("text/plain"),
    },
    annotations: { idempotentHint: false, openWorldHint: true },
  }, safe((args) => gmail.createReplyDraft(args)));

  server.registerTool("gmail_send_draft", {
    title: "Send Gmail draft",
    description: "Send an existing draft. This causes an external communication and cannot be recalled through this server.",
    inputSchema: { draftId: z.string().min(1) },
    annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, safe(({ draftId }) => gmail.sendDraft(draftId)));

  server.registerTool("gmail_trash_thread", {
    title: "Trash Gmail thread",
    description: "Move a Gmail thread to Trash. This server deliberately does not expose permanent deletion.",
    inputSchema: { threadId: z.string().min(1) },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, safe(({ threadId }) => gmail.trashThread(threadId)));

  return server;
}
