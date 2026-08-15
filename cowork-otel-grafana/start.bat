@echo off
setlocal
if not exist .env (
  copy /Y .env.example .env >nul
)
docker compose up -d
docker compose ps
echo.
echo Grafana: http://localhost:23000
echo Cowork OTLP: http://localhost:24318
endlocal
