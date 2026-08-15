from html import escape
from typing import Any

import httpx
from fastapi import Request
from fastapi.responses import HTMLResponse

from app.config import Settings


def _provider_from_params(params: dict[str, Any]) -> str:
    explicit_provider = params.get("custom_llm_provider") or params.get("litellm_provider")
    if explicit_provider:
        return str(explicit_provider)

    model = str(params.get("model") or "")
    if "/" in model:
        return model.split("/", 1)[0]
    return "default"


async def load_provider_mappings(settings: Settings, http_client: httpx.AsyncClient | None = None) -> tuple[list[dict[str, str]], str | None]:
    url = settings.litellm_base_url.rstrip("/") + "/model/info"
    headers = {"Authorization": f"Bearer {settings.litellm_master_key}"}
    try:
        if http_client is None:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=headers)
        else:
            response = await http_client.get(url, headers=headers)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        return [], f"LiteLLM model API unreachable: {exc}"

    try:
        data = response.json()
    except ValueError as exc:
        return [], f"LiteLLM model API returned invalid JSON: {exc}"

    raw_models = data.get("data") if isinstance(data, dict) else None
    if not isinstance(raw_models, list):
        return [], "LiteLLM model API returned no model list"

    mappings: list[dict[str, str]] = []
    for item in raw_models:
        if not isinstance(item, dict):
            continue
        params = item.get("litellm_params") or {}
        if not isinstance(params, dict):
            params = {}
        model_name = str(item.get("model_name") or "")
        upstream_model = str(params.get("model") or "")
        api_base = str(params.get("api_base") or "")
        mappings.append(
            {
                "model_name": model_name,
                "provider": _provider_from_params(params),
                "upstream_model": upstream_model,
                "api_base": api_base,
            }
        )

    return mappings, None


def available_endpoints() -> list[dict[str, str]]:
    return [
        {"method": "GET", "path": "/", "description": "Web dashboard"},
        {"method": "GET", "path": "/web", "description": "Web dashboard"},
        {"method": "GET", "path": "/docs", "description": "Swagger UI for gateway routes"},
        {"method": "GET", "path": "/openapi.json", "description": "Gateway OpenAPI schema"},
        {"method": "GET", "path": "/api/gateway/info", "description": "Dashboard data as JSON"},
        {"method": "GET", "path": "/admin", "description": "LiteLLM Admin UI (model management, keys, spend)"},
        {"method": "ANY", "path": "/admin/{path:path}", "description": "LiteLLM Admin UI assets and API"},
        {"method": "GET", "path": "/health", "description": "Gateway health check"},
        {"method": "GET", "path": "/ready", "description": "Gateway plus LiteLLM readiness check"},
        {"method": "GET", "path": "/api/web/domain_info?domain=github.com", "description": "Domain allow check"},
        {"method": "GET", "path": "/claude-desktop/api/web/domain_info?domain=github.com", "description": "Claude Desktop domain allow check"},
        {"method": "GET", "path": "/v1/models", "description": "LiteLLM models through gateway"},
        {"method": "POST", "path": "/v1/chat/completions", "description": "OpenAI-compatible chat completions"},
        {"method": "POST", "path": "/v1/messages", "description": "Anthropic-compatible messages"},
        {"method": "ANY", "path": "/*", "description": "Other requests are proxied to LiteLLM"},
    ]


async def gateway_info(request: Request) -> dict[str, Any]:
    settings: Settings = request.app.state.settings
    http_client = getattr(request.app.state, "http_client", None)
    mappings, warning = await load_provider_mappings(settings, http_client)
    return {
        "gateway_base_url": str(request.base_url).rstrip("/"),
        "litellm_base_url": settings.litellm_base_url,
        "domain_policy": {
            "allow_all_domains": settings.allow_all_domains,
            "allowed_domains": settings.allowed_domain_list,
        },
        "provider_mappings": mappings,
        "api_endpoints": available_endpoints(),
        "warning": warning,
    }


def dashboard_html(info: dict[str, Any]) -> HTMLResponse:
    mapping_rows = "\n".join(
        "<tr>"
        f"<td>{escape(row['model_name'])}</td>"
        f"<td>{escape(row['provider'])}</td>"
        f"<td>{escape(row['upstream_model'])}</td>"
        f"<td>{escape(row['api_base'])}</td>"
        "</tr>"
        for row in info["provider_mappings"]
    )
    if not mapping_rows:
        mapping_rows = '<tr><td colspan="4" class="muted">No provider mapping found.</td></tr>'

    endpoint_rows = "\n".join(
        "<tr>"
        f"<td><span class=\"method\">{escape(row['method'])}</span></td>"
        f"<td><code>{escape(row['path'])}</code></td>"
        f"<td>{escape(row['description'])}</td>"
        "</tr>"
        for row in info["api_endpoints"]
    )

    allowed_domains = info["domain_policy"]["allowed_domains"]
    domain_text = ", ".join(allowed_domains) if allowed_domains else "All domains allowed"
    warning = info.get("warning")
    warning_html = f'<div class="notice">{escape(str(warning))}</div>' if warning else ""

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claude Local Gateway</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #18202b;
      --muted: #667085;
      --line: #d8dee8;
      --accent: #0f766e;
      --accent-weak: #e6f4f1;
      --warn: #8a5a00;
      --warn-bg: #fff6dc;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }}
    main {{
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 42px;
    }}
    header {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 22px;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 1.08;
      letter-spacing: 0;
    }}
    h2 {{
      margin: 0 0 12px;
      font-size: 18px;
      letter-spacing: 0;
    }}
    p {{ margin: 0; }}
    code {{
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      color: #263244;
      word-break: break-word;
    }}
    .muted {{ color: var(--muted); }}
    .status {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }}
    .metric {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-width: 0;
    }}
    .metric .label {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }}
    .metric .value {{
      font-size: 15px;
      font-weight: 650;
      overflow-wrap: anywhere;
    }}
    section {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-top: 14px;
      overflow: hidden;
    }}
    .section-head {{
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: baseline;
    }}
    .table-wrap {{ overflow-x: auto; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }}
    th, td {{
      padding: 12px 18px;
      text-align: left;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }}
    th {{
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      background: #fbfcfd;
    }}
    tr:last-child td {{ border-bottom: 0; }}
    .method {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 54px;
      height: 24px;
      border-radius: 6px;
      background: var(--accent-weak);
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
    }}
    .notice {{
      margin-bottom: 14px;
      padding: 12px 14px;
      border: 1px solid #f1d184;
      border-radius: 8px;
      color: var(--warn);
      background: var(--warn-bg);
    }}
    @media (max-width: 820px) {{
      main {{ width: min(100% - 24px, 1180px); padding-top: 18px; }}
      header {{ display: block; }}
      .status {{ grid-template-columns: 1fr; }}
      .section-head {{ display: block; }}
    }}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Claude Local Gateway</h1>
        <p class="muted">Provider mapping and available API endpoints.</p>
      </div>
    </header>

    {warning_html}

    <div class="status">
      <div class="metric">
        <div class="label">Gateway</div>
        <div class="value"><code>{escape(info['gateway_base_url'])}</code></div>
      </div>
      <div class="metric">
        <div class="label">LiteLLM upstream</div>
        <div class="value"><code>{escape(info['litellm_base_url'])}</code></div>
      </div>
      <div class="metric">
        <div class="label">Domain policy</div>
        <div class="value">{escape(domain_text)}</div>
      </div>
    </div>

    <section>
      <div class="section-head">
        <h2>Provider Mapping</h2>
        <p class="muted">{len(info['provider_mappings'])} models</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client model</th>
              <th>Provider</th>
              <th>Upstream model</th>
              <th>API base</th>
            </tr>
          </thead>
          <tbody>{mapping_rows}</tbody>
        </table>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>API Endpoints</h2>
        <p class="muted">Local gateway routes</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>{endpoint_rows}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>"""
    return HTMLResponse(html)
