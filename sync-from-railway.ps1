# Sync data FROM Railway TO local
# This is a ONE-WAY sync - Railway data overwrites local data
# Local changes are NOT pushed to Railway

Write-Host "🔄 Syncing data from Railway to local..." -ForegroundColor Cyan
Write-Host ""

# Check if RAILWAY_DATABASE_URL is set
if (-not $env:RAILWAY_DATABASE_URL) {
    Write-Host "❌ Error: RAILWAY_DATABASE_URL not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set your Railway database URL first:" -ForegroundColor Yellow
    Write-Host '  $env:RAILWAY_DATABASE_URL = "postgresql://user:pass@host:port/database"' -ForegroundColor Gray
    Write-Host ""
    Write-Host "You can find this in Railway dashboard:" -ForegroundColor Yellow
    Write-Host "  1. Click on Postgres service" -ForegroundColor Gray
    Write-Host "  2. Go to 'Variables' tab" -ForegroundColor Gray
    Write-Host "  3. Copy the DATABASE_URL value" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Railway database URL configured" -ForegroundColor Green

# Navigate to server directory
Set-Location -Path (Join-Path $PSScriptRoot "server")

# Run the sync script
node sync-from-railway.js

Write-Host ""
Write-Host "✨ Done! Your local database now matches Railway." -ForegroundColor Green
Write-Host ""
