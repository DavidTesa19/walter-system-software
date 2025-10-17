# PowerShell script to sync production data to local
# Usage: .\sync-from-railway.ps1

Write-Host "📥 Syncing production data to local..." -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (-not (Test-Path "server\.env")) {
    Write-Host "❌ Error: server\.env file not found" -ForegroundColor Red
    Write-Host "Please create .env file with RAILWAY_DATABASE_URL" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Gray
    Write-Host "  RAILWAY_DATABASE_URL=postgresql://user:pass@host:5432/database" -ForegroundColor Gray
    exit 1
}

# Navigate to server directory
Set-Location server

# Run sync script
Write-Host "Running sync script..." -ForegroundColor Green
node sync-from-production.js

# Return to root directory
Set-Location ..

Write-Host ""
Write-Host "✓ Sync complete!" -ForegroundColor Green
Write-Host "Your local db.json now has production data" -ForegroundColor Cyan
