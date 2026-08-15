# Claude Local Gateway

FastAPI gateway for Claude Desktop / Claude Code in front of LiteLLM.

Architecture:

```text
Claude Desktop / Claude Code
        |
        | http://localhost:4100
        v
Claude Local Gateway
        |
        | http://litellm:4000
        v
LiteLLM
        |
        v
https://ollama.com/v1
```

Claude clients should use:

```text
Base URL = http://localhost:4100
API key = the same value as LITELLM_MASTER_KEY
```

Do not point Claude clients at `http://localhost:4000`; LiteLLM is only exposed inside the Docker network by default.

## Environment

Create `.env` from `.env.example` and set real secrets:

```powershell
Copy-Item .env.example .env
notepad .env
```

`OLLAMA_API_KEY` is sent only to LiteLLM. The gateway receives only `LITELLM_MASTER_KEY`.

## Run

```powershell
docker compose up -d --build
```

Open the simple gateway dashboard:

```text
http://localhost:4100/web
```

It shows LiteLLM provider mapping from `config.yaml` and the local API endpoints available through the gateway. The same data is available as JSON at:

```text
http://localhost:4100/api/gateway/info
```

View gateway logs:

```powershell
docker compose logs -f claude-gateway
```

Validate Compose:

```powershell
docker compose config
```

## Domain Safety Check

```powershell
Invoke-RestMethod `
  -Headers @{
    Authorization = "Bearer sk-local-change-me"
  } `
  -Uri "http://localhost:4100/api/web/domain_info?domain=github.com"
```

Claude Desktop variant:

```powershell
Invoke-RestMethod `
  -Headers @{
    Authorization = "Bearer sk-local-change-me"
  } `
  -Uri "http://localhost:4100/claude-desktop/api/web/domain_info?domain=docs.github.com"
```

## LiteLLM Models Through Gateway

```powershell
Invoke-RestMethod `
  -Headers @{
    Authorization = "Bearer sk-local-change-me"
  } `
  -Uri "http://localhost:4100/v1/models"
```

## OpenAI Chat API

```powershell
$body = @{
  model = "glm-5.2"
  messages = @(
    @{
      role = "user"
      content = "ตอบคำว่า OK"
    }
  )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Headers @{
    Authorization = "Bearer sk-local-change-me"
    "Content-Type" = "application/json"
  } `
  -Uri "http://localhost:4100/v1/chat/completions" `
  -Body $body
```

## Anthropic Messages API

```powershell
$body = @{
  model = "claude-sonnet-4-5"
  max_tokens = 64
  messages = @(
    @{
      role = "user"
      content = "Reply with OK"
    }
  )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Headers @{
    Authorization = "Bearer sk-local-change-me"
    "Content-Type" = "application/json"
    "anthropic-version" = "2023-06-01"
  } `
  -Uri "http://localhost:4100/v1/messages" `
  -Body $body
```

## Claude Desktop / CC Switch Profile Example

The exact field names may vary by Claude Desktop 3P or CC Switch version and profile schema. The important values are:

```json
{
  "baseUrl": "http://localhost:4100",
  "apiKey": "sk-local-change-me",
  "coworkEgressAllowedHosts": ["*"]
}
```

## Tests

From the repository root:

```powershell
python -m pip install -r gateway/requirements.txt
python -m pytest gateway
```

The tests cover bearer authentication, domain allowlist matching, malformed domains, query and body proxying, forwarded authorization, `/v1/messages`, `/v1/chat/completions`, SSE streaming, timeout and connection error mapping, request size limits, readiness failure, request IDs, and log redaction.
