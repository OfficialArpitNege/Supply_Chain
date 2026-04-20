param(
    [string]$VenvPath = "C:\Users\ankit\TESTING\.venv311",
    [string]$RequirementsPath = "",
    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RequirementsPath)) {
    $RequirementsPath = Join-Path $scriptDir "requirements-artifacts-py311.txt"
}

$testScriptPath = Join-Path $scriptDir "test_models.py"

Write-Host "=== Smart Supply Chain ML Artifact Bootstrap ===" -ForegroundColor Cyan
Write-Host "Script Directory : $scriptDir"
Write-Host "Venv Path        : $VenvPath"
Write-Host "Requirements     : $RequirementsPath"
Write-Host "Test Script      : $testScriptPath"
Write-Host ""

if (-not (Test-Path $RequirementsPath)) {
    throw "Requirements file not found: $RequirementsPath"
}

if (-not (Test-Path $testScriptPath)) {
    throw "Test script not found: $testScriptPath"
}

Write-Host "Step 1/4: Checking Python 3.11 availability..." -ForegroundColor Yellow
py -3.11 -c "import sys; print(sys.version)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "" 
    Write-Host "Python 3.11 is not available on this machine." -ForegroundColor Red
    Write-Host "Install Python 3.11, then rerun this script." -ForegroundColor Red
    Write-Host "Download: https://www.python.org/downloads/windows/"
    exit 1
}
Write-Host "Python 3.11 is available." -ForegroundColor Green
Write-Host ""

Write-Host "Step 2/4: Creating virtual environment (if needed)..." -ForegroundColor Yellow
if (-not (Test-Path $VenvPath)) {
    py -3.11 -m venv "$VenvPath"
    Write-Host "Created venv at $VenvPath" -ForegroundColor Green
} else {
    Write-Host "Venv already exists at $VenvPath" -ForegroundColor Green
}

$venvPython = Join-Path $VenvPath "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    throw "Python executable not found in venv: $venvPython"
}
Write-Host ""

Write-Host "Step 3/4: Installing artifact-compatible dependencies..." -ForegroundColor Yellow
& "$venvPython" -m pip install --upgrade pip
& "$venvPython" -m pip install -r "$RequirementsPath"
Write-Host "Dependencies installed." -ForegroundColor Green
Write-Host ""

if ($SkipTest) {
    Write-Host "Step 4/4: Skipped model test execution (--SkipTest used)." -ForegroundColor Yellow
    Write-Host "Bootstrap completed successfully." -ForegroundColor Green
    exit 0
}

Write-Host "Step 4/4: Running model test script..." -ForegroundColor Yellow
Push-Location $scriptDir
try {
    & "$venvPython" "$testScriptPath"
    if ($LASTEXITCODE -ne 0) {
        throw "test_models.py exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Bootstrap and model testing completed successfully." -ForegroundColor Green
