$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) { throw ".env not found: $envPath" }

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $root ".env.backup-$timestamp"
Copy-Item $envPath $backupPath -Force

# Read current values. Last declaration wins, matching dotenv behavior.
$values = [ordered]@{}
Get-Content $envPath | ForEach-Object {
    $line = $_
    if ($line -match '^\s*#' -or $line -match '^\s*$') { return }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $values[$matches[1]] = $matches[2]
    }
}

$groups = @(
    @{
        Title = "1. Application / Network / Proxy"
        Keys = @(
            "APP_HOST","APP_PORT","FRONTEND_PUBLIC_URL","BACKEND_URL","NEXT_PUBLIC_API_BASE_URL",
            "MAX_UPLOAD_SIZE","CORS_ORIGINS","CORS_ORIGIN_REGEX","NEXT_ALLOWED_DEV_ORIGINS",
            "NEXT_PROXY_TIMEOUT_MS","NEXT_PROXY_MAX_BODY_SIZE"
        )
    },
    @{
        Title = "2. TaskList Integration"
        Note = "Single base URL; API paths and methods are configured explicitly."
        Keys = @(
            "TASKLIST_API_URL","TASKLIST_AUTH_PATH","TASKLIST_WORKFLOW_PATH",
            "TASKLIST_AUTH_METHOD","TASKLIST_WORKFLOW_READ_METHOD","TASKLIST_WORKFLOW_WRITE_METHOD",
            "TASKLIST_WORKFLOW_API_TOKEN","TASKLIST_API_TIMEOUT_SEC","TASKLIST_AUTH_TIMEOUT_SEC",
            "TASKLIST_VERIFY_SSL","TASKLIST_ALLOWED_ORIGINS"
        )
    },
    @{
        Title = "3. Procurement Integration"
        Keys = @(
            "PROCUREMENT_WEB_URL","PROCUREMENT_RECEIVE_JOB_URL","PROCUREMENT_RECEIVE_JOB_METHOD",
            "PROCUREMENT_API_TIMEOUT_SEC","PROCUREMENT_DEFAULT_EMPLOYEE_ID","SSO_DEFAULT_EMPLOYEE_ID",
            "DEFAULT_OFFICE_CODE"
        )
    },
    @{
        Title = "4. Local Application Database"
        Keys = @("DB_TYPE","SQLITE_PATH","MYSQL_HOST","MYSQL_PORT","MYSQL_USER","MYSQL_PASSWORD","MYSQL_DB")
    },
    @{
        Title = "5. MSSQL / ProcurementApp"
        Keys = @(
            "MSSQL_HOST","MSSQL_PORT","MSSQL_USER","MSSQL_PASSWORD","MSSQL_DB","PROCUREMENT_DB",
            "MSSQL_LOGIN_TIMEOUT_SEC","MSSQL_QUERY_TIMEOUT_SEC"
        )
    },
    @{
        Title = "6. OpenAI / EzeIn Core"
        Keys = @(
            "OPENAI_API_KEY","OPENAI_BASE_URL","OPENAI_MODEL","OPENAI_TIMEOUT_SEC",
            "OPENAI_MAX_RETRIES","OPENAI_REASONING_EFFORT","OPENAI_MAX_OUTPUT_TOKENS"
        )
    },
    @{
        Title = "7. Document AI / Agent"
        Keys = @(
            "DOCUMENT_AI_TASK_BATCH_SIZE","OPENAI_AGENT_TIMEOUT_SEC","OPENAI_PLAN_TIMEOUT_SEC"
        )
    },
    @{
        Title = "8. Wall AI / OpenAI Audit"
        Keys = @(
            "OPENAI_WALL_TIMEOUT_SEC","OPENAI_WALL_BATCH_SIZE","OPENAI_WALL_IMAGE_MAX_SIDE",
            "OPENAI_WALL_MAX_RAW_CANDIDATES","OPENAI_WALL_MAX_CURRENT_WALLS","OPENAI_WALL_MAX_OUTPUT_TOKENS",
            "OPENAI_WALL_REASONING_EFFORT","OPENAI_WALL_MIN_GAP_CONFIDENCE","OPENAI_WALL_RESCUE_REJECTED",
            "OPENAI_WALL_AUDIT_COLUMNS","OPENAI_WALL_AUDIT_ROWS","OPENAI_WALL_AUDIT_CONCURRENCY",
            "OPENAI_WALL_AUDIT_MAX_TARGETS","OPENAI_WALL_AUDIT_ADD_CONFIDENCE",
            "OPENAI_WALL_AUDIT_CONFIRM_CONFIDENCE","OPENAI_WALL_AUDIT_DELETE_CONFIDENCE",
            "OPENAI_WALL_AUDIT_REPLACE_CONFIDENCE"
        )
    },
    @{
        Title = "9. Gemini - Optional / Legacy"
        Keys = @(
            "GEMINI_API_KEY","GEMINI_API_URL","GEMINI_AGENT_MODEL","GEMINI_AGENT_TIMEOUT_SEC",
            "GEMINI_WALL_MODEL","GEMINI_WALL_TIMEOUT_SEC","GEMINI_WALL_MAX_RAW_CANDIDATES"
        )
    },
    @{
        Title = "10. Detection / OCR / YOLO"
        Keys = @("YOLO_MODELS_DIR","EZEFLOOR_OCR_DEBUG")
    },
    @{
        Title = "11. Wall Prior / Geometry Guidance"
        Keys = @(
            "WALL_PRIOR_ENABLED","WALL_PRIOR_WEIGHT","WALL_PRIOR_THRESHOLD","WALL_PRIOR_HIGH_CONF",
            "WALL_PRIOR_ROI_PADDING","WALL_PRIOR_DEBUG"
        )
    },
    @{
        Title = "12. SMTP / Notifications"
        Keys = @("SMTP_SERVER","SMTP_PORT","SMTP_USER","SMTP_PASS","SMTP_SENDER_NAME","ADMIN_NOTIFICATION_EMAIL")
    },
    @{
        Title = "13. Security / Session / SSO"
        Keys = @(
            "SESSION_TIMEOUT_MINUTES","SESSION_COOKIE_MAX_AGE","PASSWORD_SALT","MAX_FAILED_ATTEMPTS",
            "TOOL_AI_SSO_SECRET"
        )
    },
    @{
        Title = "14. ML Runtime"
        Keys = @(
            "FLAGS_ENABLE_PIR_API","FLAGS_ENABLE_PIR_IN_EXECUTOR","FLAGS_PIR_APPLY_INPLACE_PASS",
            "FLAGS_USE_MKLDNN","KMP_DUPLICATE_LIB_OK"
        )
    }
)

$known = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($group in $groups) {
    foreach ($key in $group.Keys) { [void]$known.Add($key) }
}

# Known obsolete aliases from the old split-config approach. They are intentionally
# excluded from the rewritten .env only when a canonical replacement exists.
$deprecatedMap = [ordered]@{
    "APP_PUBLIC_URL" = "BACKEND_URL"
    "NEXT_PUBLIC_DIRECT_BACKEND_URL" = "BACKEND_URL"
    "NEXT_PUBLIC_PROCUREMENT_WEB_URL" = "PROCUREMENT_WEB_URL"
    "NEXT_PUBLIC_PROCUREMENT_DEFAULT_EMPLOYEE_ID" = "PROCUREMENT_DEFAULT_EMPLOYEE_ID"
    "NEXT_PUBLIC_SSO_DEFAULT_EMPLOYEE_ID" = "SSO_DEFAULT_EMPLOYEE_ID"
    "NEXT_PUBLIC_DEFAULT_OFFICE_CODE" = "DEFAULT_OFFICE_CODE"
    "NEXT_PUBLIC_TASKLIST_ALLOWED_ORIGINS" = "TASKLIST_ALLOWED_ORIGINS"
    "TASKLIST_AUTH_URL" = "TASKLIST_API_URL"
    "TASKLIST_AUTH_URLS" = "TASKLIST_API_URL"
    "TASKLIST_WORKFLOW_API_URL" = "TASKLIST_API_URL"
}

$droppedDeprecated = New-Object System.Collections.Generic.List[string]
foreach ($oldKey in $deprecatedMap.Keys) {
    $newKey = $deprecatedMap[$oldKey]
    if ($values.Contains($oldKey) -and $values.Contains($newKey)) {
        [void]$droppedDeprecated.Add($oldKey)
        $values.Remove($oldKey)
    }
}

$out = New-Object System.Collections.Generic.List[string]
$out.Add("# ============================================================")
$out.Add("# EzeFloor environment configuration")
$out.Add("# Runtime/deployment values only. Keep secrets out of source control.")
$out.Add("# ============================================================")

foreach ($group in $groups) {
    $present = @($group.Keys | Where-Object { $values.Contains($_) })
    if ($present.Count -eq 0) { continue }

    $out.Add("")
    $out.Add("# ------------------------------------------------------------")
    $out.Add("# $($group.Title)")
    if ($group.Note) { $out.Add("# $($group.Note)") }
    $out.Add("# ------------------------------------------------------------")

    foreach ($key in $group.Keys) {
        if ($values.Contains($key)) { $out.Add("$key=$($values[$key])") }
    }
}

$unknown = @($values.Keys | Where-Object { -not $known.Contains($_) } | Sort-Object)
if ($unknown.Count -gt 0) {
    $out.Add("")
    $out.Add("# ------------------------------------------------------------")
    $out.Add("# 15. Unclassified - Review Required")
    $out.Add("# These keys are preserved because the organizer does not recognize them yet.")
    $out.Add("# Move them into a named group after confirming their purpose; do not delete blindly.")
    $out.Add("# ------------------------------------------------------------")
    foreach ($key in $unknown) { $out.Add("$key=$($values[$key])") }
}

$out.Add("")
Set-Content -Path $envPath -Value $out -Encoding UTF8

Write-Host "Reorganized .env into functional groups." -ForegroundColor Green
Write-Host "Backup: $backupPath" -ForegroundColor DarkGray
if ($droppedDeprecated.Count -gt 0) {
    Write-Host "Removed duplicate/deprecated aliases because canonical keys already exist:" -ForegroundColor DarkYellow
    $droppedDeprecated | ForEach-Object { Write-Host "  $_" }
}
if ($unknown.Count -gt 0) {
    Write-Host "Unclassified keys still need review:" -ForegroundColor Yellow
    $unknown | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "No unclassified keys remain." -ForegroundColor Green
}
