#!/usr/bin/env sh
set -eu

PORT="${1:-24318}"
ENDPOINT="http://localhost:${PORT}/v1/logs"
NOW_NANOS="$(($(date +%s) * 1000000000))"

cat > /tmp/cowork-otel-poc.json <<EOF
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        {"key":"service.name","value":{"stringValue":"cowork"}},
        {"key":"service.version","value":{"stringValue":"poc-test"}}
      ]
    },
    "scopeLogs": [{
      "scope": {"name":"cowork-poc-test"},
      "logRecords": [
        {
          "timeUnixNano":"${NOW_NANOS}",
          "severityText":"INFO",
          "body":{"stringValue":"POC user prompt"},
          "attributes":[
            {"key":"event_name","value":{"stringValue":"user_prompt"}},
            {"key":"session.id","value":{"stringValue":"poc-session"}}
          ]
        },
        {
          "timeUnixNano":"${NOW_NANOS}",
          "severityText":"INFO",
          "body":{"stringValue":"POC tool result"},
          "attributes":[
            {"key":"event_name","value":{"stringValue":"tool_result"}},
            {"key":"tool_name","value":{"stringValue":"filesystem"}},
            {"key":"success","value":{"stringValue":"true"}}
          ]
        }
      ]
    }]
  }]
}
EOF

curl -fsS \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/cowork-otel-poc.json \
  "${ENDPOINT}"

echo
echo "OK - test events sent to ${ENDPOINT}"
