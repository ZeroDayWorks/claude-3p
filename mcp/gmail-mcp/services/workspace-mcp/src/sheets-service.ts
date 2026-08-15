import { google, type Auth } from "googleapis";

export class SheetsService {
  private sheets: ReturnType<typeof google.sheets>;
  private drive: ReturnType<typeof google.drive>;

  constructor(auth: Auth.OAuth2Client) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.drive = google.drive({ version: "v3", auth });
  }

  async listSpreadsheets(query?: string, maxResults = 20, pageToken?: string) {
    const q = query
      ? `mimeType='application/vnd.google-apps.spreadsheet' and (${query})`
      : "mimeType='application/vnd.google-apps.spreadsheet'";
    const response = await this.drive.files.list({
      q,
      pageSize: maxResults,
      pageToken,
      fields: "nextPageToken, files(id, name, createdTime, modifiedTime)",
    });
    return { files: response.data.files, nextPageToken: response.data.nextPageToken };
  }

  async getSpreadsheet(spreadsheetId: string) {
    const response = await this.sheets.spreadsheets.get({ spreadsheetId });
    return response.data;
  }

  async readRange(spreadsheetId: string, range: string) {
    const response = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
    return { range: response.data.range, values: response.data.values };
  }

  async writeRange(spreadsheetId: string, range: string, values: unknown[][], valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED") {
    const response = await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return response.data;
  }

  async appendRows(spreadsheetId: string, range: string, values: unknown[][], valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED") {
    const response = await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return response.data;
  }

  async createSpreadsheet(title: string, sheetTitles?: string[]) {
    const response = await this.sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: sheetTitles?.map((t) => ({ properties: { title: t } })),
      },
    });
    return { spreadsheetId: response.data.spreadsheetId, title: response.data.properties?.title, spreadsheetUrl: response.data.spreadsheetUrl };
  }

  async batchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]) {
    const response = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
    return response.data;
  }
}
