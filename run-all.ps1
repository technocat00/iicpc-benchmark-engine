$ErrorActionPreference = "Stop"

Write-Host "Starting IICPC Benchmark Engine locally..." -ForegroundColor Cyan

# Check if Docker is running
docker compose version >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running. Please start Docker Desktop first!" -ForegroundColor Red
    exit 1
}

# 1. Start Infrastructure ONLY (Kafka/Redis) — NOT the Rust service containers
# We run Rust binaries directly below for faster iteration
Write-Host "Starting Redis and Redpanda (Kafka)..." -ForegroundColor Yellow
docker compose up -d redpanda redis redpanda-console

# --- WHY WE WAIT ---
# Redpanda (Kafka) takes ~15 seconds to fully boot and be ready to accept
# connections. Our Rust services start in under 1 second. If we start Rust
# before Kafka is ready, it logs WARN retries -- which is fine (it self-heals)
# but looks messy. We wait 15s for a clean startup.
Write-Host "Waiting 15 seconds for Kafka to fully initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 2. Build the workspace (dev mode for fast iteration)
Write-Host "Compiling Rust services..." -ForegroundColor Yellow
cargo build

# 3. Start the Rust services in separate windows so you can see their logs
Write-Host "Starting Telemetry Ingester on port 4000..." -ForegroundColor Yellow
$ingesterProcess = Start-Process -FilePath "target\debug\telemetry-ingester.exe" -PassThru -NoNewWindow

Start-Sleep -Seconds 1

Write-Host "Starting Sandboxing Engine on port 8000..." -ForegroundColor Yellow
$sandboxProcess = Start-Process -FilePath "target\debug\sandboxing-engine.exe" -PassThru -NoNewWindow

Start-Sleep -Seconds 1

$dummyProcesses = @()
$loadGenProcesses = @()

Write-Host "Starting 10 Dummy Contestant Engines and Load Generators..." -ForegroundColor Yellow

for ($i = 0; $i -lt 10; $i++) {
    $port = 8080 + $i
    $contestantId = "contestant-$($i + 1)"
    
    # Start Dummy Engine
    $env:PORT = $port
    $dummy = Start-Process -FilePath "target\debug\dummy-engine.exe" -PassThru -NoNewWindow
    $dummyProcesses += $dummy

    # Start Load Generator
    $env:TARGET_URL = "http://localhost:$port/api/order"
    $env:CONTESTANT_ID = $contestantId
    # Reduce workers heavily so we don't totally overwhelm the local PC
    $env:NUM_WORKERS = "2"
    $loadGen = Start-Process -FilePath "target\debug\load-generator.exe" -PassThru -NoNewWindow
    $loadGenProcesses += $loadGen
}

Write-Host "" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Green
Write-Host " All systems running (10 Contestants)!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host " Telemetry API  -> http://localhost:4000/api/scores" -ForegroundColor Cyan
Write-Host " Health Check   -> http://localhost:4000/health" -ForegroundColor Cyan
Write-Host " WebSocket      -> ws://localhost:4000/ws" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Green
Write-Host " Press Ctrl+C to shut everything down." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green
Write-Host "" -ForegroundColor White

# Keep alive until Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "Shutting down all services..." -ForegroundColor Yellow
    foreach ($p in $loadGenProcesses) { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }
    foreach ($p in $dummyProcesses) { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }
    Stop-Process -Id $sandboxProcess.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $ingesterProcess.Id -ErrorAction SilentlyContinue
    docker compose stop
    Write-Host "Shutdown complete." -ForegroundColor Green
}
