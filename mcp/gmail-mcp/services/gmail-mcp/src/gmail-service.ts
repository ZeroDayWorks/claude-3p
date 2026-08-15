import { google, type Auth, type gmail_v1 } from "googleapis";
import { composeRawMessage, parseMessage, type ComposeInput, type ParsedMessage } from "./mime.js";

export interface SearchInput {
  query?: string;
  labelIds?: string[];
  maxResults?: number;
  pageToken?: string;
  includeSpamTrash?: boolean;
}

export interface SearchResult {
  messages: Array<Pick<ParsedMessage, "id" | "threadId" | "labelIds" | "snippet" | "headers" | "internalDate">>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface AttachmentResult {
  messageId: string;
  attachmentId: string;
  size: number;
  dataBase64: string;
}

async function mapWithConcurrency<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < values.length) {
      const index = next++;
      output[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

function normalizedHeader(value?: string): string | undefined {
  return value?.replace(/\r?\n[\t ]+/g, " ").trim() || undefined;
}

export class GmailService {
  constructor(private readonly gmail: gmail_v1.Gmail) {}

  static fromAuth(auth: Auth.OAuth2Client): GmailService {
    return new GmailService(google.gmail({ version: "v1", auth }));
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      q: input.query,
      labelIds: input.labelIds,
      maxResults: input.maxResults ?? 20,
      pageToken: input.pageToken,
      includeSpamTrash: input.includeSpamTrash ?? false,
    });
    const ids = (response.data.messages ?? []).flatMap(({ id }) => id ? [id] : []);
    const details = await mapWithConcurrency(ids, 5, (id) => this.getMessage(id, "metadata"));
    return {
      messages: details.map(({ id, threadId, labelIds, snippet, headers, internalDate }) => ({
        id, threadId, labelIds, snippet, headers, ...(internalDate ? { internalDate } : {}),
      })),
      ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      ...(response.data.resultSizeEstimate != null ? { resultSizeEstimate: response.data.resultSizeEstimate } : {}),
    };
  }

  async getMessage(id: string, format: "full" | "metadata" = "full"): Promise<ParsedMessage> {
    const response = await this.gmail.users.messages.get({ userId: "me", id, format });
    return parseMessage(response.data);
  }

  async getThread(id: string): Promise<{ id: string; historyId?: string; messages: ParsedMessage[] }> {
    const response = await this.gmail.users.threads.get({ userId: "me", id, format: "full" });
    return {
      id: response.data.id ?? id,
      ...(response.data.historyId ? { historyId: response.data.historyId } : {}),
      messages: (response.data.messages ?? []).map(parseMessage),
    };
  }

  async listLabels(): Promise<gmail_v1.Schema$Label[]> {
    const response = await this.gmail.users.labels.list({ userId: "me" });
    return response.data.labels ?? [];
  }

  async modifyThreadLabels(id: string, addLabelIds: string[], removeLabelIds: string[]): Promise<gmail_v1.Schema$Thread> {
    if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
      throw new Error("At least one label must be added or removed");
    }
    const overlap = addLabelIds.filter((label) => removeLabelIds.includes(label));
    if (overlap.length) throw new Error(`A label cannot be added and removed in the same call: ${overlap.join(", ")}`);
    const response = await this.gmail.users.threads.modify({
      userId: "me", id, requestBody: { addLabelIds, removeLabelIds },
    });
    return response.data;
  }

  async createDraft(input: ComposeInput & { threadId?: string }): Promise<{ id: string; messageId?: string; threadId?: string }> {
    const response = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: composeRawMessage(input), threadId: input.threadId } },
    });
    if (!response.data.id) throw new Error("Gmail created a draft without returning its id");
    return {
      id: response.data.id,
      ...(response.data.message?.id ? { messageId: response.data.message.id } : {}),
      ...(response.data.message?.threadId ? { threadId: response.data.message.threadId } : {}),
    };
  }

  async createReplyDraft(input: {
    messageId: string;
    body: string;
    contentType?: "text/plain" | "text/html";
  }): Promise<{ id: string; messageId?: string; threadId?: string; replyingTo: string }> {
    const original = await this.getMessage(input.messageId);
    const replyingTo = normalizedHeader(original.headers["reply-to"] ?? original.headers.from);
    if (!replyingTo) throw new Error("The original message has no Reply-To or From header");
    const originalMessageId = normalizedHeader(original.headers["message-id"]);
    if (!originalMessageId) throw new Error("The original message has no Message-ID header required for a threaded reply");
    const previousReferences = normalizedHeader(original.headers.references);
    const subject = normalizedHeader(original.headers.subject) ?? "";
    const draft = await this.createDraft({
      to: [replyingTo],
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      body: input.body,
      contentType: input.contentType,
      threadId: original.threadId,
      inReplyTo: originalMessageId,
      references: [previousReferences, originalMessageId].filter(Boolean).join(" "),
    });
    return { ...draft, replyingTo };
  }

  async getAttachment(messageId: string, attachmentId: string, maxBytes: number): Promise<AttachmentResult> {
    const response = await this.gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
    if (!response.data.data) throw new Error("Gmail returned an attachment without data");
    const data = Buffer.from(response.data.data, "base64url");
    if (data.byteLength > maxBytes) {
      throw new Error(`Attachment is ${data.byteLength} bytes, exceeding the ${maxBytes}-byte response limit`);
    }
    return {
      messageId,
      attachmentId,
      size: data.byteLength,
      dataBase64: data.toString("base64"),
    };
  }

  async sendDraft(id: string): Promise<{ id: string; threadId: string; labelIds: string[] }> {
    const response = await this.gmail.users.drafts.send({ userId: "me", requestBody: { id } });
    if (!response.data.id || !response.data.threadId) throw new Error("Gmail sent the draft but did not return message identifiers");
    return { id: response.data.id, threadId: response.data.threadId, labelIds: response.data.labelIds ?? [] };
  }

  async trashThread(id: string): Promise<{ id?: string; labelIds?: string[] }> {
    const response = await this.gmail.users.threads.trash({ userId: "me", id });
    return { id: response.data.id ?? undefined, labelIds: response.data.messages?.[0]?.labelIds ?? undefined };
  }
}
