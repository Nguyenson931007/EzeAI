param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)
$ErrorActionPreference = "Stop"
$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) { throw ".env not found: $envPath" }

$lines = [System.Collections.Generic.List[string]](Get-Content $envPath)
$map = @{}
for ($i=0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -match '^\s*([^#][^=]*)=(.*)$') {
        $key = $matches[1].Trim(); $value = $matches[2].Trim()
        $map[$key] = @{ Index=$i; Value=$value }
    }
}
function Set-EnvValue([string]$Key, [string]$Value, [switch]$OnlyIfBlank) {
    if ($map.ContainsKey($Key)) {
        if ($OnlyIfBlank -and -not [string]::IsNullOrWhiteSpace($map[$Key].Value)) { return }
        $idx = $map[$Key].Index
        $lines[$idx] = "$Key=$Value"
        $map[$Key].Value = $Value
    } else {
        $lines.Add("$Key=$Value") | Out-Null
        $map[$Key] = @{ Index=$lines.Count-1; Value=$Value }
    }
}
function Get-EnvValue([string]$Key) {
    if ($map.ContainsKey($Key)) { return [string]$map[$Key].Value }
    return ""
}

# Runtime / proxy
Set-EnvValue APP_HOST "0.0.0.0" -OnlyIfBlank
Set-EnvValue APP_PORT "8090" -OnlyIfBlank
Set-EnvValue APP_PUBLIC_URL "http://localhost:8090" -OnlyIfBlank
Set-EnvValue FRONTEND_PUBLIC_URL "http://localhost:3011" -OnlyIfBlank
Set-EnvValue BACKEND_URL "http://127.0.0.1:8090" -OnlyIfBlank
Set-EnvValue NEXT_PUBLIC_DIRECT_BACKEND_URL "http://127.0.0.1:8090" -OnlyIfBlank
Set-EnvValue CORS_ORIGIN_REGEX "https://.*\.ngrok-free\.dev" -OnlyIfBlank
Set-EnvValue NEXT_ALLOWED_DEV_ORIGINS "localhost:3011,127.0.0.1:3011,14.241.197.188,*.ngrok-free.dev,*.ngrok-free.app,*.ngrok.io,*.ngrok.app" -OnlyIfBlank
Set-EnvValue NEXT_PROXY_TIMEOUT_MS "900000" -OnlyIfBlank
Set-EnvValue NEXT_PROXY_MAX_BODY_SIZE "150mb" -OnlyIfBlank

# TaskList - preserve existing auth URL/token. Workflow URL is derived by backend if blank.
$origins = "https://103.77.167.69:8081,http://103.77.167.69:8081,http://14.241.197.188:7749,https://14.241.197.188:7749,http://14.241.197.188,https://14.241.197.188,http://localhost:7749,http://127.0.0.1:7749,http://localhost:3011,http://127.0.0.1:3011"
Set-EnvValue TASKLIST_WORKFLOW_API_URL "" -OnlyIfBlank
Set-EnvValue TASKLIST_WORKFLOW_API_TOKEN "" -OnlyIfBlank
Set-EnvValue TASKLIST_WORKFLOW_READ_METHOD "GET" -OnlyIfBlank
Set-EnvValue TASKLIST_WORKFLOW_WRITE_METHOD "PUT" -OnlyIfBlank
Set-EnvValue TASKLIST_API_TIMEOUT_SEC "5" -OnlyIfBlank
Set-EnvValue TASKLIST_AUTH_TIMEOUT_SEC "1.5" -OnlyIfBlank
Set-EnvValue TASKLIST_VERIFY_SSL "false" -OnlyIfBlank
Set-EnvValue TASKLIST_ALLOWED_ORIGINS $origins -OnlyIfBlank
Set-EnvValue NEXT_PUBLIC_TASKLIST_ALLOWED_ORIGINS $origins -OnlyIfBlank

# Procurement - values moved from previous source hard-codes.
Set-EnvValue PROCUREMENT_WEB_URL "http://14.241.197.188:7642" -OnlyIfBlank
Set-EnvValue NEXT_PUBLIC_PROCUREMENT_WEB_URL "http://14.241.197.188:7642" -OnlyIfBlank
Set-EnvValue PROCUREMENT_RECEIVE_JOB_URL "http://14.241.197.188:7642/api/receive-job" -OnlyIfBlank
Set-EnvValue PROCUREMENT_RECEIVE_JOB_METHOD "POST" -OnlyIfBlank
Set-EnvValue PROCUREMENT_API_TIMEOUT_SEC "5" -OnlyIfBlank
Set-EnvValue PROCUREMENT_DEFAULT_EMPLOYEE_ID "EZE0052" -OnlyIfBlank
Set-EnvValue NEXT_PUBLIC_PROCUREMENT_DEFAULT_EMPLOYEE_ID "EZE0052" -OnlyIfBlank
Set-EnvValue SSO_DEFAULT_EMPLOYEE_ID "EZE0090" -OnlyIfBlank
Set-EnvValue NEXT_PUBLIC_SSO_DEFAULT_EMPLOYEE_ID "EZE0090" -OnlyIfBlank
Set-EnvValue DEFAULT_OFFICE_CODE "EZE0098" -OnlyIfBlank
Set-EnvValue NEXT_PUBLIC_DEFAULT_OFFICE_CODE "EZE0098" -OnlyIfBlank

# DB / provider transport settings
Set-EnvValue MSSQL_LOGIN_TIMEOUT_SEC "10" -OnlyIfBlank
Set-EnvValue MSSQL_QUERY_TIMEOUT_SEC "30" -OnlyIfBlank
Set-EnvValue OPENAI_BASE_URL "https://api.openai.com/v1" -OnlyIfBlank
Set-EnvValue OPENAI_MAX_RETRIES "3" -OnlyIfBlank
Set-EnvValue OPENAI_REASONING_EFFORT "none" -OnlyIfBlank
Set-EnvValue GEMINI_API_URL "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent" -OnlyIfBlank

# Optional settings can intentionally remain blank; code treats them as disabled/not configured.
foreach ($key in @('GEMINI_API_KEY','ADMIN_NOTIFICATION_EMAIL')) { Set-EnvValue $key "" -OnlyIfBlank }

Set-Content -Path $envPath -Value $lines -Encoding UTF8

# Remove stale source backup containing obsolete hard-coded addresses if present.
$stale = Join-Path $ProjectRoot "frontend_next\src\models\api.service.js.bak_signal_fix"
if (Test-Path $stale) { Remove-Item $stale -Force }

Write-Host "Updated runtime configuration: $envPath" -ForegroundColor Green
Write-Host "Existing passwords, tokens, MSSQL settings, and existing non-empty values were preserved." -ForegroundColor Green
