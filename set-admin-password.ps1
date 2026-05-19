# Run from QIBB-backend-main folder:
#   powershell -ExecutionPolicy Bypass -File .\set-admin-password.ps1
#
# Requires .env in this folder with MONGODB_URI or COSMOS_URI (copy from Azure qipp-api).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.env")) {
  Write-Host "Create a file named .env in this folder with:" -ForegroundColor Yellow
  Write-Host 'MONGODB_URI=mongodb+srv://...paste from Azure...' -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Azure Portal -> qipp-api -> Environment variables -> MONGODB_URI -> Show value"
  exit 1
}

$email = Read-Host "Admin email (default: admin@acwaops.com)"
if ([string]::IsNullOrWhiteSpace($email)) { $email = "admin@acwaops.com" }

$secure = Read-Host "New password (min 6 characters)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)

if ($plain.Length -lt 6) {
  Write-Host "Password must be at least 6 characters." -ForegroundColor Red
  exit 1
}

node scripts/set-user-password.js $email $plain
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done. Sign in at https://qipp.live with:" -ForegroundColor Green
  Write-Host "  Email:    $email"
  Write-Host "  Password: (what you just entered)"
}
