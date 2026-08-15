import { google, type Auth } from "googleapis";

export class DocsService {
  private docs: ReturnType<typeof google.docs>;

  constructor(auth: Auth.OAuth2Client) {
    this.docs = google.docs({ version: "v1", auth });
  }

  async getDocument(documentId: string) {
    const response = await this.docs.documents.get({ documentId });
    return response.data;
  }

  async createDocument(title: string) {
    const response = await this.docs.documents.create({ requestBody: { title } });
    return { documentId: response.data.documentId, title: response.data.title };
  }

  async insertText(documentId: string, text: string, index = 1) {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { location: { index }, text } }],
      },
    });
    return response.data;
  }

  async replaceText(documentId: string, searchText: string, replaceText: string, matchCase = false) {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ replaceAllText: { containsText: { text: searchText, matchCase }, replaceText } }],
      },
    });
    return response.data;
  }

  async batchUpdate(documentId: string, requests: Record<string, unknown>[]) {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
    return response.data;
  }
}
