param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$previousPath = Get-Location
$secureInputs = @()

function Set-PrivateVariable([string]$variableName, [string]$prompt) {
    $value = Read-Host $prompt -AsSecureString
    $script:secureInputs += $value
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
    try {
        [Environment]::SetEnvironmentVariable($variableName, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer), 'Process')
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

try {
    Set-Location -LiteralPath $projectPath
    Write-Host 'Enter credentials privately. Input is masked and will not be saved to a file.'
    Set-PrivateVariable 'BOOTSTRAP_ADMIN_EMAIL' 'Administrator email'
    if (-not $VerifyOnly) { Set-PrivateVariable 'BOOTSTRAP_ADMIN_NAME' 'Administrator full name' }
    Set-PrivateVariable 'BOOTSTRAP_ADMIN_PASSWORD' 'Strong password (14-256 characters)'
    if (-not $VerifyOnly) {
        Set-PrivateVariable 'BOOTSTRAP_PASSWORD_CONFIRM' 'Confirm password'
        if ($env:BOOTSTRAP_ADMIN_PASSWORD -cne $env:BOOTSTRAP_PASSWORD_CONFIRM) { throw 'Password confirmation does not match.' }
        Remove-Item Env:BOOTSTRAP_PASSWORD_CONFIRM
    }
    if ($VerifyOnly) { & node --import tsx scripts/bootstrap-and-verify.ts --verify-only }
    else { & node --import tsx scripts/bootstrap-and-verify.ts }
    if ($LASTEXITCODE -ne 0) { throw 'Bootstrap or verification did not finish. Ask Codex to inspect the redacted verification report.' }
} catch {
    Write-Host 'Operation stopped. Credentials have not been displayed. Ask Codex to inspect the verification status.'
    exit 1
} finally {
    foreach ($variableName in @('BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_PASSWORD', 'BOOTSTRAP_PASSWORD_CONFIRM')) {
        [Environment]::SetEnvironmentVariable($variableName, $null, 'Process')
    }
    foreach ($value in $secureInputs) { $value.Dispose() }
    Set-Location -LiteralPath $previousPath
}
