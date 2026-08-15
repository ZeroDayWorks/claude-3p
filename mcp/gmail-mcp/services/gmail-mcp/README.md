# Gmail MCP server

A Gmail Model Context Protocol server supporting both local stdio and stateless Streamable HTTP. It lets an MCP client search and read mail, inspect threads and labels, retrieve small attachments, organize threads, create new or correctly threaded reply drafts, explicitly send an existing draft, and move threads to Trash.

## Safety-oriented design

- Search returns metadata and snippets; full bodies require a separate message/thread read.
- Composing creates a draft. Sending is a separate tool with a destructive annotation.
- MIME headers reject newline injection, and attachment responses have a configurable 5 MB hard ceiling.
- OAuth callbacks validate a random state token and time out after five minutes.
- Permanent deletion is intentionally not exposed.
- OAuth credentials and refresh tokens remain local and are ignored by Git.
- The default scope is `gmail.modify`. Change `GMAIL_SCOPES` if you are deploying a narrower read-only server, then re-authorize.

## Setup

1. Use Node.js 20 or newer and run `npm install`.
2. In Google Cloud, enable the Gmail API, configure the OAuth consent screen, and create an OAuth client of type **Desktop app**.
3. Download the client JSON as `credentials.json` in this directory (or set `GMAIL_CREDENTIALS_PATH`).
4. Copy `.env.example` values into your shell/environment as needed. This project does not implicitly load `.env` files.
5. Run `npm run build`.
6. Run `npm run auth` and approve access in the browser. This writes `token.json` locally.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["D:/absolute/path/to/gmail-mcp/dist/index.js"],
      "env": {
        "GMAIL_CREDENTIALS_PATH": "D:/absolute/path/to/gmail-mcp/credentials.json",
        "GMAIL_TOKEN_PATH": "D:/absolute/path/to/gmail-mcp/token.json"
      }
    }
  }
}
```

## Tools

| Tool | Effect |
| --- | --- |
| `gmail_search` | Search and return message metadata/snippets |
| `gmail_get_message` | Read a complete message |
| `gmail_get_thread` | Read a complete conversation |
| `gmail_get_attachment` | Fetch a small attachment as base64 with a strict size limit |
| `gmail_list_labels` | List label names and IDs |
| `gmail_modify_thread_labels` | Add/remove labels on a thread |
| `gmail_create_draft` | Create a new draft without sending |
| `gmail_create_reply_draft` | Derive recipient and threading headers and create a reply draft |
| `gmail_send_draft` | Send one existing draft |
| `gmail_trash_thread` | Move a thread to Trash |

## Development

```sh
npm run check
npm test
npm run build
```

For a hosted multi-user deployment, replace the local token file with encrypted per-user token storage and use Streamable HTTP with MCP authorization. Do not share one refresh token between users.
