import type { Auth } from "googleapis";
import { z } from "zod";
import { createMcpServer } from "@google-workspace/auth";
import { SheetsService } from "./sheets-service.js";
import { DocsService } from "./docs-service.js";
import { DriveService } from "./drive-service.js";

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
  const message = typeof status === "number" ? `Google API error ${status}: ${detail}` : detail;
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function safe<TArgs extends Record<string, unknown>>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  };
}

export function createServer(auth: Auth.OAuth2Client) {
  const server = createMcpServer("workspace-mcp", "0.1.0");
  const allowDestructive = process.env.ALLOW_DESTRUCTIVE === "true";
  const sheets = new SheetsService(auth);

  server.registerTool("sheets_list", {
    title: "List spreadsheets",
    description: "Search for Google Spreadsheets in Drive.",
    inputSchema: {
      query: z.string().optional().describe("Additional Drive query filter"),
      maxResults: z.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe((args) => sheets.listSpreadsheets(args.query, args.maxResults, args.pageToken)));

  server.registerTool("sheets_get", {
    title: "Get spreadsheet metadata",
    description: "Get spreadsheet metadata including sheet names and properties.",
    inputSchema: { spreadsheetId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ spreadsheetId }) => sheets.getSpreadsheet(spreadsheetId)));

  server.registerTool("sheets_read_range", {
    title: "Read range",
    description: "Read cell values from a range using A1 notation (e.g. 'Sheet1!A1:D10').",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1).describe("A1 notation range, e.g. 'Sheet1!A1:D10'"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ spreadsheetId, range }) => sheets.readRange(spreadsheetId, range)));

  server.registerTool("sheets_write_range", {
    title: "Write range",
    description: "Write or update cell values in a range.",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1),
      values: z.array(z.array(z.unknown())).describe("2D array of cell values"),
      valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ spreadsheetId, range, values, valueInputOption }) => sheets.writeRange(spreadsheetId, range, values, valueInputOption)));

  server.registerTool("sheets_append_rows", {
    title: "Append rows",
    description: "Append rows after the last row with data in a sheet.",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1).describe("Sheet name or range to find the table, e.g. 'Sheet1'"),
      values: z.array(z.array(z.unknown())),
      valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ spreadsheetId, range, values, valueInputOption }) => sheets.appendRows(spreadsheetId, range, values, valueInputOption)));

  server.registerTool("sheets_create", {
    title: "Create spreadsheet",
    description: "Create a new Google Spreadsheet.",
    inputSchema: {
      title: z.string().min(1),
      sheetTitles: z.array(z.string()).optional().describe("Optional list of sheet tab names"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ title, sheetTitles }) => sheets.createSpreadsheet(title, sheetTitles)));

  server.registerTool("sheets_batch_update", {
    title: "Batch update spreadsheet",
    description: "Apply multiple operations (add/delete sheets, format cells, etc.) in one request.",
    inputSchema: {
      spreadsheetId: z.string().min(1),
      requests: z.array(z.record(z.string(), z.unknown())).describe("Array of Sheets API batch update request objects"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ spreadsheetId, requests }) => sheets.batchUpdate(spreadsheetId, requests)));

  const docs = new DocsService(auth);

  server.registerTool("docs_get", {
    title: "Get document",
    description: "Read the full content and structure of a Google Doc.",
    inputSchema: { documentId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ documentId }) => docs.getDocument(documentId)));

  server.registerTool("docs_create", {
    title: "Create document",
    description: "Create a new Google Doc.",
    inputSchema: { title: z.string().min(1) },
    annotations: { openWorldHint: true },
  }, safe(({ title }) => docs.createDocument(title)));

  server.registerTool("docs_insert_text", {
    title: "Insert text",
    description: "Insert text at a specific position in a Google Doc.",
    inputSchema: {
      documentId: z.string().min(1),
      text: z.string().min(1),
      index: z.number().int().min(1).default(1).describe("1-based character index to insert at"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ documentId, text, index }) => docs.insertText(documentId, text, index)));

  server.registerTool("docs_replace_text", {
    title: "Replace text",
    description: "Find and replace all occurrences of text in a Google Doc.",
    inputSchema: {
      documentId: z.string().min(1),
      searchText: z.string().min(1),
      replaceText: z.string(),
      matchCase: z.boolean().default(false),
    },
    annotations: { openWorldHint: true },
  }, safe(({ documentId, searchText, replaceText, matchCase }) => docs.replaceText(documentId, searchText, replaceText, matchCase)));

  server.registerTool("docs_batch_update", {
    title: "Batch update document",
    description: "Apply multiple operations (insert, delete, format) to a Google Doc in one request.",
    inputSchema: {
      documentId: z.string().min(1),
      requests: z.array(z.record(z.string(), z.unknown())).describe("Array of Docs API batch update request objects"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ documentId, requests }) => docs.batchUpdate(documentId, requests)));

  const drive = new DriveService(auth);

  server.registerTool("drive_list_files", {
    title: "List files",
    description: "List files and folders in Google Drive. Optionally filter by parent folder.",
    inputSchema: {
      folderId: z.string().optional().describe("Parent folder ID to list contents of"),
      maxResults: z.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ folderId, maxResults, pageToken }) => drive.listFiles(folderId, maxResults, pageToken)));

  server.registerTool("drive_search", {
    title: "Search files",
    description: "Search files in Google Drive using Drive query syntax.",
    inputSchema: {
      query: z.string().min(1).describe("Drive query, e.g. \"name contains 'report'\""),
      maxResults: z.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ query, maxResults, pageToken }) => drive.searchFiles(query, maxResults, pageToken)));

  server.registerTool("drive_get_metadata", {
    title: "Get file metadata",
    description: "Get metadata for a file (name, type, size, links).",
    inputSchema: { fileId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ fileId }) => drive.getFileMetadata(fileId)));

  server.registerTool("drive_download", {
    title: "Download file",
    description: "Download a file from Google Drive. Google Docs/Sheets are exported. Enforces a size limit.",
    inputSchema: {
      fileId: z.string().min(1),
      maxBytes: z.number().int().min(1).max(10_000_000).default(5_000_000),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ fileId, maxBytes }) => drive.downloadFile(fileId, maxBytes)));

  server.registerTool("drive_upload", {
    title: "Upload file",
    description: "Upload a file to Google Drive.",
    inputSchema: {
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      content: z.string().describe("File content (utf8 text or base64)"),
      encoding: z.enum(["utf8", "base64"]).default("utf8"),
      parentId: z.string().optional().describe("Parent folder ID"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ fileName, mimeType, content, encoding, parentId }) => drive.uploadFile(fileName, mimeType, content, encoding, parentId)));

  server.registerTool("drive_create_folder", {
    title: "Create folder",
    description: "Create a new folder in Google Drive.",
    inputSchema: {
      name: z.string().min(1),
      parentId: z.string().optional(),
    },
    annotations: { openWorldHint: true },
  }, safe(({ name, parentId }) => drive.createFolder(name, parentId)));

  server.registerTool("drive_update_file", {
    title: "Update file",
    description: "Rename or move a file in Google Drive.",
    inputSchema: {
      fileId: z.string().min(1),
      name: z.string().optional().describe("New file name"),
      addParents: z.string().optional().describe("Folder ID to move file into"),
      removeParents: z.string().optional().describe("Folder ID to remove from"),
    },
    annotations: { openWorldHint: true },
  }, safe(({ fileId, name, addParents, removeParents }) => drive.updateFile(fileId, name, addParents, removeParents)));

  if (allowDestructive) {
    server.registerTool("drive_delete", {
      title: "Delete file",
      description: "Permanently delete a file from Google Drive. This cannot be undone.",
      inputSchema: { fileId: z.string().min(1) },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    }, safe(({ fileId }) => drive.deleteFile(fileId)));
  }

  return server;
}
