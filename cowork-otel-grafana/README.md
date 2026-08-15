# Claude Cowork OpenTelemetry POC

Minimal stack:

```text
Claude Cowork
   |
   | OTLP HTTP (HTTP/protobuf or HTTP/JSON)
   v
OpenTelemetry Collector
   |
   +--> debug exporter --> docker logs
   |
   +--> OTLP/HTTP
          v
        Loki
          |
          v
       Grafana
```

## Default ports

Only two host ports are published.

| Purpose | Host port | Container port | Bind |
|---|---:|---:|---|
| Cowork OTLP HTTP endpoint | `24318` | `4318` | `0.0.0.0` |
| Grafana dashboard | `23000` | `3000` | `127.0.0.1` |
| Loki | not published | `3100` | Docker network only |

The host ports are intentionally non-standard to reduce collision risk. Change them in `.env` if required.

## 1. Start

Windows:

```powershell
Copy-Item .env.example .env
docker compose up -d
docker compose ps
```

Or just double-click / run:

```text
start.bat
```

## 2. Verify the pipeline before touching Claude

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\send-test-events.ps1
```

Then open:

```text
http://localhost:23000
```

Login:

```text
user: admin
password: cowork-poc
```

The pre-provisioned home dashboard is:

```text
Claude Cowork - OpenTelemetry POC
```

You should see test events within a few seconds.

## 3. Configure Claude Cowork

In the OpenTelemetry settings use:

```text
OpenTelemetry collector endpoint:
http://localhost:24318

Protocol:
HTTP/protobuf
```

No headers are required for this local POC.

Start a **new Cowork session** after changing the telemetry setting.

### If `localhost` does not work

Cowork's exporter can run inside a VM. In that case `localhost` can point at the VM rather than Windows.

Find the Windows host IPv4 address:

```powershell
ipconfig
```

Example:

```text
192.168.1.50
```

Then set the Cowork endpoint to:

```text
http://192.168.1.50:24318
```

`OTEL_BIND_ADDRESS=0.0.0.0` is already enabled in `.env.example` for this case.

If Windows Firewall blocks it, allow inbound TCP `24318` only from the network/profile you need.

## 4. Useful commands

Follow Collector events:

```powershell
docker compose logs -f otel-collector
```

Follow Loki:

```powershell
docker compose logs -f loki
```

Follow Grafana:

```powershell
docker compose logs -f grafana
```

Stop:

```powershell
docker compose down
```

Stop and delete POC data:

```powershell
docker compose down -v
```

## 5. Port collision

Check the default ports:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 24318,23000 } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

If a port is occupied, edit `.env`, for example:

```env
OTEL_HTTP_PORT=25318
GRAFANA_PORT=24000
```

Then restart:

```powershell
docker compose down
docker compose up -d
```

And update the Cowork endpoint / Grafana URL to match.

## 6. What is stored

This minimal POC stores **OTel logs/events** in Loki. The Collector also accepts metrics and traces and prints them to its Docker logs, but does not persist them.

The dashboard is designed around Cowork event names such as:

- `user_prompt`
- `assistant_response`
- `tool_result`
- `api_request`
- `api_error`
- `tool_decision`

The raw event stream is always available in the `Recent Cowork Events` panel.

## 7. Security note

This is intentionally a POC:

- OTLP ingestion has no authentication.
- Loki is internal-only and is not published to the host.
- Grafana is bound to `127.0.0.1`.
- OTLP is bound to `0.0.0.0` only so a Cowork VM can reach the Windows host.

For a real deployment, put authentication/TLS in front of the Collector and define retention/redaction rules before collecting prompt or tool content.
