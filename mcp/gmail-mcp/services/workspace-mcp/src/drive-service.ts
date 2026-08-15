import { google, type Auth } from "googleapis";
import { Readable } from "node:stream";

const EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "application/pdf",
};

export class DriveService {
  private drive: ReturnType<typeof google.drive>;

  constructor(auth: Auth.OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
  }

  async listFiles(folderId?: string, maxResults = 20, pageToken?: string) {
    const q = folderId ? `'${folderId}' in parents and trashed=false` : "trashed=false";
    const response = await this.drive.files.list({
      q,
      pageSize: maxResults,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)",
    });
    return { files: response.data.files, nextPageToken: response.data.nextPageToken };
  }

  async searchFiles(query: string, maxResults = 20, pageToken?: string) {
    const response = await this.drive.files.list({
      q: `${query} and trashed=false`,
      pageSize: maxResults,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)",
    });
    return { files: response.data.files, nextPageToken: response.data.nextPageToken };
  }

  async getFileMetadata(fileId: string) {
    const response = await this.drive.files.get({
      fileId,
      fields: "id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink",
    });
    return response.data;
  }

  async downloadFile(fileId: string, maxBytes = 5_000_000) {
    const meta = await this.drive.files.get({ fileId, fields: "mimeType, name, size" });
    const mimeType = meta.data.mimeType ?? "";
    const fileName = meta.data.name ?? "file";

    if (mimeType.startsWith("application/vnd.google-apps.")) {
      const exportMimeType = EXPORT_MIME_TYPES[mimeType] ?? "application/pdf";
      const response = await this.drive.files.export({ fileId, mimeType: exportMimeType }, { responseType: "arraybuffer" });
      const buffer = Buffer.from(response.data as ArrayBuffer);
      if (buffer.length > maxBytes) throw new Error(`Exported file exceeds ${maxBytes} byte limit`);
      return { fileName, mimeType: exportMimeType, content: buffer.toString("base64"), encoding: "base64" as const };
    }

    const response = await this.drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data as ArrayBuffer);
    if (buffer.length > maxBytes) throw new Error(`File exceeds ${maxBytes} byte limit`);
    const isText = mimeType.startsWith("text/") || mimeType === "application/json";
    return isText
      ? { fileName, mimeType, content: buffer.toString("utf8"), encoding: "utf8" as const }
      : { fileName, mimeType, content: buffer.toString("base64"), encoding: "base64" as const };
  }

  async uploadFile(fileName: string, mimeType: string, content: string, encoding: "utf8" | "base64" = "utf8", parentId?: string) {
    const buffer = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    const media = { mimeType, body: Readable.from(buffer) };
    const requestBody: Record<string, unknown> = { name: fileName };
    if (parentId) requestBody.parents = [parentId];
    const response = await this.drive.files.create({ requestBody, media, fields: "id, name, mimeType, webViewLink" });
    return response.data;
  }

  async createFolder(name: string, parentId?: string) {
    const requestBody: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
    if (parentId) requestBody.parents = [parentId];
    const response = await this.drive.files.create({ requestBody, fields: "id, name, mimeType" });
    return response.data;
  }

  async updateFile(fileId: string, name?: string, addParents?: string, removeParents?: string) {
    const response = await this.drive.files.update({
      fileId,
      requestBody: name ? { name } : undefined,
      addParents,
      removeParents,
      fields: "id, name, parents",
    });
    return response.data;
  }

  async deleteFile(fileId: string) {
    const meta = await this.drive.files.get({ fileId, fields: "name" });
    await this.drive.files.delete({ fileId });
    return { deleted: meta.data.name, fileId };
  }
}
