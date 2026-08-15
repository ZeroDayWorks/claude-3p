param(
  [int]$Port = 24318
)

$ErrorActionPreference = "Stop"

$endpoint = "http://localhost:$Port/v1/logs"
$nowNanos = ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000).ToString()
$sessionId = "poc-session-" + [guid]::NewGuid().ToString("N")
$promptId = [guid]::NewGuid().ToString()

function Attr([string]$key, [string]$value) {
  return @{
    key = $key
    value = @{ stringValue = $value }
  }
}

function LogRecord([string]$eventName, [string]$message, [hashtable]$extra = @{}) {
  $attrs = @(
    (Attr "event_name" $eventName),
    (Attr "session.id" $sessionId),
    (Attr "prompt.id" $promptId)
  )

  foreach ($key in $extra.Keys) {
    $attrs += Attr $key ([string]$extra[$key])
  }

  return @{
    timeUnixNano = $nowNanos
    observedTimeUnixNano = $nowNanos
    severityText = "INFO"
    body = @{ stringValue = $message }
    attributes = $attrs
  }
}

$records = @(
  (LogRecord "user_prompt" "POC prompt: verify Cowork OpenTelemetry pipeline"),
  (LogRecord "assistant_response" "POC assistant response" @{ model = "poc-model"; response_length = "22" }),
  (LogRecord "api_request" "POC API request" @{ model = "poc-model"; input_tokens = "120"; output_tokens = "35"; duration_ms = "250"; cost_usd = "0.001" }),
  (LogRecord "tool_decision" "POC tool approved" @{ tool_name = "filesystem"; decision = "accept"; source = "config" }),
  (LogRecord "tool_result" "POC tool result" @{ tool_name = "filesystem"; success = "true"; duration_ms = "42" }),
  (LogRecord "api_error" "POC synthetic API error" @{ model = "poc-model"; status_code = "500"; error = "synthetic test error" })
)

$payload = @{
  resourceLogs = @(
    @{
      resource = @{
        attributes = @(
          (Attr "service.name" "cowork"),
          (Attr "service.version" "poc-test"),
          (Attr "process.owner" $env:USERNAME)
        )
      }
      scopeLogs = @(
        @{
          scope = @{ name = "cowork-poc-test" }
          logRecords = $records
        }
      )
    }
  )
}

$json = $payload | ConvertTo-Json -Depth 20 -Compress

Write-Host "POST $endpoint"
Invoke-RestMethod `
  -Uri $endpoint `
  -Method Post `
  -ContentType "application/json" `
  -Body $json | Out-Null

Write-Host "OK - sent $($records.Count) test events"
Write-Host "Open Grafana: http://localhost:23000"
